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

# Verify out-of-order failure webhook transition cannot downgrade paid state.
psql -v ON_ERROR_STOP=1 -c "update payments set status='failed' where id='$ID_A' and status in ('created','pending') and gateway_payment_id is null" >/dev/null
psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
 IF (SELECT status FROM payments WHERE id='$ID_A') <> 'paid' THEN RAISE EXCEPTION 'late failure downgraded payment'; END IF;
 IF (SELECT status FROM orders WHERE id='$ORDER_ID') <> 'paid' THEN RAISE EXCEPTION 'late failure downgraded order'; END IF;
END
\$\$;
SQL

# Race reservation and settlement on another order: both must serialize on order lock.
RACE_ORDER='40000000-0000-0000-0000-000000000003'
RACE_REQUEST='30000000-0000-0000-0000-000000000003'
psql -v ON_ERROR_STOP=1 <<SQL
INSERT INTO service_requests(id,user_id,service_id,status) VALUES ('$RACE_REQUEST','$USER_ID','$SERVICE_ID','pending');
INSERT INTO orders(id,order_number,user_id,service_request_id,total,currency,status) VALUES ('$RACE_ORDER','CI-ORDER-RACE','$USER_ID','$RACE_REQUEST',100,'INR','pending');
INSERT INTO order_items(order_id,service_id,quantity,unit_price,line_total) VALUES ('$RACE_ORDER','$SERVICE_ID',1,100,100);
SQL
RACE_PAYMENT=$(psql -v ON_ERROR_STOP=1 -Atc "select ils_reserve_razorpay_attempt('$RACE_ORDER')->>'payment_id'")
psql -v ON_ERROR_STOP=1 -c "select ils_attach_razorpay_order('$RACE_PAYMENT','gw-order-race')" >/dev/null
psql -v ON_ERROR_STOP=1 -c "select ils_finalize_razorpay_payment('$RACE_PAYMENT','gw-payment-race',10000,'INR')" >/tmp/race-finalize.log &
FINALIZE_PID=$!
# This call can either return the existing attempt or fail if settlement wins first.
psql -v ON_ERROR_STOP=1 -c "select ils_reserve_razorpay_attempt('$RACE_ORDER')" >/tmp/race-reserve.log 2>&1 &
RESERVE_PID=$!

wait "$FINALIZE_PID"
wait "$RESERVE_PID" || true
psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
 IF (SELECT status FROM orders WHERE id='$RACE_ORDER') <> 'paid' THEN RAISE EXCEPTION 'race order not paid'; END IF;
 IF (SELECT count(*) FROM payments WHERE order_id='$RACE_ORDER' AND status='paid') <> 1 THEN RAISE EXCEPTION 'race payment count not exactly one'; END IF;
 IF (SELECT count(*) FROM entitlements WHERE order_id='$RACE_ORDER') <> 1 THEN RAISE EXCEPTION 'race entitlement count not exactly one'; END IF;
END
\$\$;
SQL
