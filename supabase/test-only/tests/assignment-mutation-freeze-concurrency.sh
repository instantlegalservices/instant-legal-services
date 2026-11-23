#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD=postgres
DB="host=localhost port=5432 user=postgres dbname=ils_assignment_freeze"
ACTOR="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
ASSIGNMENT_ID="bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb"

psql "$DB" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO public.ils_professional_assignment_mutation_alert_thresholds
  (failure_code,window_minutes,review_threshold,stop_threshold,action,active)
VALUES ('AUTH_REQUIRED',15,2,4,'STOP_MUTATION_CHANNEL',true);
INSERT INTO public.ils_professional_assignment_mutation_alert_escalation_rules
  (decision,action_code,severity,requires_human_approval,destructive_action_allowed,active)
VALUES ('STOP','FREEZE_MUTATION_CHANNEL','CRITICAL',true,false,true);
INSERT INTO public.ils_professional_work_assignment_links
  (id,work_item_id,work_stream,professional_user_id,link_status)
VALUES ('$ASSIGNMENT_ID',gen_random_uuid(),'LEGAL','$ACTOR','PENDING');
INSERT INTO public.ils_professional_assignment_mutation_failure_telemetry(failure_code)
SELECT 'AUTH_REQUIRED' FROM generate_series(1,4);

CREATE TABLE public.test_assignment_freeze_race_marker(id integer PRIMARY KEY);
CREATE OR REPLACE FUNCTION public.test_pause_assignment_update_for_freeze_race()
RETURNS trigger LANGUAGE plpgsql AS \$trigger\$
BEGIN
  IF current_setting('test.freeze_race',true)='true' THEN
    INSERT INTO public.test_assignment_freeze_race_marker(id) VALUES(1)
    ON CONFLICT DO NOTHING;
    PERFORM pg_sleep(2);
  END IF;
  RETURN NEW;
END;
\$trigger\$;
CREATE TRIGGER test_assignment_freeze_race_pause
BEFORE UPDATE ON public.ils_professional_work_assignment_links
FOR EACH ROW EXECUTE FUNCTION public.test_pause_assignment_update_for_freeze_race();
SQL

# Session A enters mutation commit, obtains the shared channel lock, then the
# test trigger signals that the assignment update is in flight and pauses it.
psql "$DB" -v ON_ERROR_STOP=1 > /tmp/ils-freeze-session-a.log 2>&1 <<SQL &
BEGIN;
SELECT set_config('request.jwt.claim.sub','$ACTOR',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('test.freeze_race','true',true);
SELECT public.ils_professional_assignment_mutation_commit('$ASSIGNMENT_ID','ACTIVATE','ACTIVE');
COMMIT;
SQL
PID_A=$!

# Wait until Session A has passed the gate and entered the assignment UPDATE.
for i in $(seq 1 50); do
  marker=$(psql "$DB" -Atqc "SELECT count(*) FROM public.test_assignment_freeze_race_marker")
  if [[ "$marker" == "1" ]]; then break; fi
  sleep 0.1
done
if [[ "${marker:-0}" != "1" ]]; then
  cat /tmp/ils-freeze-session-a.log
  echo "Session A did not reach the in-flight assignment update" >&2
  exit 1
fi

# Session B now attempts the STOP evaluator. It must wait for Session A's
# shared channel lock, then freeze after A's already-in-flight commit finishes.
psql "$DB" -v ON_ERROR_STOP=1 > /tmp/ils-freeze-session-b.log 2>&1 <<'SQL' &
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.ils_professional_assignment_evaluate_mutation_alerts(15);
SQL
PID_B=$!

wait "$PID_A"
wait "$PID_B"

# Verify the in-flight mutation linearized before freeze, and every later
# mutation is blocked with no additional assignment-state change.
psql "$DB" -v ON_ERROR_STOP=1 <<SQL
DO \$verify\$
DECLARE state text; status text; allowed boolean;
BEGIN
  SELECT channel_state INTO state
  FROM public.ils_professional_assignment_mutation_channel_control
  WHERE channel_key='PROFESSIONAL_ASSIGNMENT';
  SELECT link_status INTO status
  FROM public.ils_professional_work_assignment_links
  WHERE id='$ASSIGNMENT_ID';
  IF state<>'FROZEN' THEN RAISE EXCEPTION 'Expected FROZEN after concurrent evaluator'; END IF;
  IF status<>'ACTIVE' THEN RAISE EXCEPTION 'In-flight mutation should commit before freeze, got %',status; END IF;

  PERFORM set_config('request.jwt.claim.sub','$ACTOR',true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  allowed:=public.ils_professional_assignment_mutation_commit('$ASSIGNMENT_ID','PAUSE','PAUSED');
  IF allowed IS DISTINCT FROM false THEN RAISE EXCEPTION 'Post-freeze concurrent mutation was allowed'; END IF;
  SELECT link_status INTO status
  FROM public.ils_professional_work_assignment_links
  WHERE id='$ASSIGNMENT_ID';
  IF status<>'ACTIVE' THEN RAISE EXCEPTION 'Post-freeze mutation changed status to %',status; END IF;
END;
\$verify\$;
SQL
