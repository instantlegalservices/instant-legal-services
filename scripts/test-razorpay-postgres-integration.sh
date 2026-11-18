#!/usr/bin/env bash
set -euo pipefail
psql -v ON_ERROR_STOP=1 -f scripts/razorpay-integration-fixture.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261118191500_atomic_razorpay_payment_finalization.sql

# Fixed fixture IDs; all test data is isolated in the ephemeral CI database.
USER_ID='10000000-0000-0000-0000-000000000001'
SERVICE_ID='20000000-0000-0000-0000-000000000001'
REQUEST_ID='30000000-0000-0000-0000-000000000001'
ORDER_ID='40000000-0000-0000-0000-000000000001'
PAYMENT_ID='50000000-0000-0000-0000-000000000001'

psql -v ON_ERROR_STOP=1 <<SQL
INSERT INTO service_requests(id,user_id,service_id,status) VALUES ('$REQUEST_ID','$USER_ID','$SERVICE_ID','pending');
INSERT INTO orders(id,order_number,user_id,service_request_id,total,currency,status) VALUES ('$ORDER_ID','CI-ORDER-001','$USER_ID','$REQUEST_ID',100,'INR','pending');
INSERT INTO order_items(order_id,service_id,quantity,unit_price,line_total) VALUES ('$ORDER_ID','$SERVICE_ID',1,100,100);
SQL

# Two parallel reservations should converge to the same payment attempt.
reserve() { psql -v ON_ERROR_STOP=1 -Atc "select ils_reserve_razorpay_attempt('$ORDER_ID')->>'payment_id'" ; }
reserve > /tmp/reserve-a &
PID_A=$!
reserve > /tmp/reserve-b &
PID_B=$!
wait "$PID_A"
wait "$PID_B"
ID_A=$(cat /tmp/reserve-a)
ID_B=$(cat /tmp/reserve-b)
if [[ "$ID_A" != "$ID_B" ]]; then echo "FAIL: duplicate reservation IDs $ID_A / $ID_B"; exit 1; fi

# Attach gateway order and settle; replay identical settlement must be idempotent.
psql -v ON_ERROR_STOP=1 <<SQL
SELECT ils_attach_razorpay_order('$ID_A','gw-order-ci-001');
SELECT ils_finalize_razorpay_payment('$ID_A','gw-payment-ci-001',10000,'INR');
SELECT ils_finalize_razorpay_payment('$ID_A','gw-payment-ci-001',10000,'INR');
DO \$\$
BEGIN
 IF (SELECT count(*) FROM payments WHERE id='$ID_A' AND status='paid') <> 1 THEN RAISE EXCEPTION 'payment not paid'; END IF;
 IF (SELECT count(*) FROM orders WHERE id='$ORDER_ID' AND status='paid') <> 1 THEN RAISE EXCEPTION 'order not paid'; END IF;
 IF (SELECT count(*) FROM entitlements WHERE order_id='$ORDER_ID') <> 1 THEN RAISE EXCEPTION 'duplicate or missing entitlement'; END IF;
END
\$\$;
SQL

# Conflicting gateway payment ID must be rejected without altering settlement.
if psql -v ON_ERROR_STOP=1 -c "select ils_finalize_razorpay_payment('$ID_A','gw-payment-conflict',10000,'INR')" >/dev/null 2>&1; then
 echo "FAIL: conflicting payment ID accepted"; exit 1
fi
echo "PASS: migration, concurrent reservation, finalization replay, conflicting payment ID, and entitlement idempotency"


# Simulate failure/capture webhook ordering through atomic guarded transitions.
# First failed event may mark an unbound pending attempt failed; capture can still settle it.
psql -v ON_ERROR_STOP=1 <<SQL
INSERT INTO service_requests(id,user_id,service_id,status) VALUES ('30000000-0000-0000-0000-000000000002','$USER_ID','$SERVICE_ID','pending');
INSERT INTO orders(id,order_number,user_id,service_request_id,total,currency,status) VALUES ('40000000-0000-0000-0000-000000000002','CI-ORDER-002','$USER_ID','30000000-0000-0000-0000-000000000002',100,'INR','pending');
INSERT INTO order_items(order_id,service_id,quantity,unit_price,line_total) VALUES ('40000000-0000-0000-0000-000000000002','$SERVICE_ID',1,100,100);
SQL
ID_B=$(psql -v ON_ERROR_STOP=1 -Atc "select ils_reserve_razorpay_attempt('40000000-0000-0000-0000-000000000002')->>'payment_id'")
psql -v ON_ERROR_STOP=1 -c "select ils_attach_razorpay_order('$ID_B','gw-order-ci-002')"
# failed before capture: safe status transition is allowed
psql -v ON_ERROR_STOP=1 -c "update payments set status='failed' where id='$ID_B' and status in ('created','pending') and gateway_payment_id is null"
psql -v ON_ERROR_STOP=1 -c "select ils_finalize_razorpay_payment('$ID_B','gw-payment-ci-002',10000,'INR')"
# delayed failed event after capture must not downgrade paid state
psql -v ON_ERROR_STOP=1 -c "update payments set status='failed' where id='$ID_B' and status in ('created','pending') and gateway_payment_id is null"
psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
 IF (SELECT status FROM payments WHERE id='$ID_B') <> 'paid' THEN RAISE EXCEPTION 'delayed failure downgraded payment'; END IF;
 IF (SELECT status FROM orders WHERE id='40000000-0000-0000-0000-000000000002') <> 'paid' THEN RAISE EXCEPTION 'delayed failure downgraded order'; END IF;
END
\$\$;
SQL

# Reservation racing with settlement: both contend on the order row lock.
# A reservation may return the existing attempt or fail because the order is already paid.
INSERT_RACE_FIXTURE='40000000-0000-0000-0000-000000000003'
psql -v ON_ERROR_STOP=1 <<SQL
INSERT INTO service_requests(id,user_id,service_id,status) VALUES ('30000000-0000-0000-0000-000000000003','$USER_ID','$SERVICE_ID','pending');
INSERT INTO orders(id,order_number,user_id,service_request_id,total,currency,status) VALUES ('40000000-0000-0000-0000-000000000003','CI-ORDER-003','$USER_ID','30000000-0000-0000-0000-000000000003',100,'INR','pending');
INSERT INTO order_items(order_id,service_id,quantity,unit_price,line_total) VALUES ('40000000-0000-0000-0000-000000000003','$SERVICE_ID',1,100,100);
SQL
ID_C=$(psql -v ON_ERROR_STOP=1 -Atc "select ils_reserve_razorpay_attempt('$INSERT_RACE_FIXTURE')->>'payment_id'")
psql -v ON_ERROR_STOP=1 -c "select ils_attach_razorpay_order('$ID_C','gw-order-ci-003')"
psql -v ON_ERROR_STOP=1 -c "select ils_finalize_razorpay_payment('$ID_C','gw-payment-ci-003',10000,'INR')" >/tmp/finalize-race.log &
FINALIZE_PID=$!
psql -v ON_ERROR_STOP=1 -c "select ils_reserve_razorpay_attempt('$INSERT_RACE_FIXTURE')" >/tmp/reserve-race.log 2>&1 &
RESERVE_PID=$!
wait "$FINALIZE_PID"
wait "$RESERVE_PID" || true
psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
 IF (SELECT status FROM orders WHERE id='$INSERT_RACE_FIXTURE') <> 'paid' THEN RAISE EXCEPTION 'race left order unpaid'; END IF;
 IF (SELECT count(*) FROM payments WHERE order_id='$INSERT_RACE_FIXTURE' AND status='paid') <> 1 THEN RAISE EXCEPTION 'race has multiple or missing paid payments'; END IF;
 IF (SELECT count(*) FROM entitlements WHERE order_id='$INSERT_RACE_FIXTURE') <> 1 THEN RAISE EXCEPTION 'race duplicated/missing entitlement'; END IF;
END
\$\$;
SQL
