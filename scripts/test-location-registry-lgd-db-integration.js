/**
 * Instant Legal Services
 * LGD Location Registry PostgreSQL Integration Verification
 *
 * ACTION 1088.288
 *
 * SAFETY:
 * - Connects ONLY to localhost PostgreSQL supplied by GitHub Actions.
 * - No Supabase.
 * - No production database.
 * - No external network connection.
 * - Uses synthetic LGD fixture only.
 * - Verifies persistence and idempotency.
 */

"use strict";

const assert = require("node:assert/strict");
const {
  spawnSync
} = require("node:child_process");

const importer =
  require("./location-registry-lgd-importer.js");

/*
 * --------------------------------------------------------------------------
 * DATABASE BOUNDARY
 * --------------------------------------------------------------------------
 */

const DB = {
  host:
    process.env.PGHOST || "127.0.0.1",

  port:
    process.env.PGPORT || "5432",

  user:
    process.env.PGUSER || "postgres",

  database:
    process.env.PGDATABASE || "ils_test"
};

/*
 * --------------------------------------------------------------------------
 * SYNTHETIC LGD FIXTURE
 * --------------------------------------------------------------------------
 */

const fixture = [
  {
    lgd_code: "09",
    name: "Fixture State",
    level: "STATE",
    parent_lgd_code: null
  },

  {
    lgd_code: "0927",
    name: "Fixture District A",
    level: "DISTRICT",
    parent_lgd_code: "09"
  },

  {
    lgd_code: "0928",
    name: "Fixture District B",
    level: "DISTRICT",
    parent_lgd_code: "09"
  },

  {
    lgd_code: "092701",
    name: "Fixture Tehsil A",
    level: "TEHSIL",
    parent_lgd_code: "0927"
  }
];

/*
 * --------------------------------------------------------------------------
 * TYPED PARENT IDENTITY MAP
 * --------------------------------------------------------------------------
 */

const parentIdentityBySourceCode =
  new Map([
    [
      "09",
      "LGD:STATE:09"
    ],
    [
      "0927",
      "LGD:DISTRICT:0927"
    ]
  ]);

/*
 * --------------------------------------------------------------------------
 * TEST STATE
 * --------------------------------------------------------------------------
 */

let passed = 0;
let failed = 0;

/*
 * --------------------------------------------------------------------------
 * TEST RUNNER
 * --------------------------------------------------------------------------
 *
 * IMPORTANT:
 * Tests may be synchronous OR asynchronous.
 * Every test is awaited before the next test begins.
 */

async function test(name, fn) {
  try {
    await fn();

    passed += 1;

    console.log(
      `PASS: ${name}`
    );
  } catch (error) {
    failed += 1;

    console.error(
      `FAIL: ${name}`
    );

    console.error(
      `      ${error.message}`
    );
  }
}

/*
 * --------------------------------------------------------------------------
 * SQL STRING ESCAPING
 * --------------------------------------------------------------------------
 */

function sqlString(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "NULL";
  }

  return `'${String(value).replace(
    /'/g,
    "''"
  )}'`;
}

/*
 * --------------------------------------------------------------------------
 * PSQL EXECUTION
 * --------------------------------------------------------------------------
 */

function runPsql(sql) {
  const result =
    spawnSync(
      "psql",
      [
        "--host",
        DB.host,

        "--port",
        DB.port,

        "--username",
        DB.user,

        "--dbname",
        DB.database,

        "--set",
        "ON_ERROR_STOP=1",

        "--tuples-only",

        "--no-align",

        "--command",
        sql
      ],
      {
        encoding: "utf8",
        env: process.env
      }
    );

  if (result.error) {
    throw result.error;
  }

  if (
    result.status !== 0
  ) {
    throw new Error(
      (
        result.stderr ||
        result.stdout ||
        "psql failed"
      ).trim()
    );
  }

  return result.stdout.trim();
}

/*
 * --------------------------------------------------------------------------
 * NUMERIC OUTPUT EXTRACTION
 * --------------------------------------------------------------------------
 *
 * Used where PostgreSQL command-tag output can coexist with SELECT output.
 */

function extractLastNumericValue(
  output
) {
  const numericLines =
    String(output)
      .split("\n")
      .map(
        line =>
          line.trim()
      )
      .filter(
        line =>
          /^\d+$/.test(line)
      );

  if (
    numericLines.length === 0
  ) {
    throw new Error(
      `No numeric result found in psql output: ${output}`
    );
  }

  return Number(
    numericLines[
      numericLines.length - 1
    ]
  );
}

/*
 * --------------------------------------------------------------------------
 * FIXTURE CLEANUP
 * --------------------------------------------------------------------------
 */

function resetFixtureRows() {
  runPsql(`
    DELETE FROM public.location_registry
    WHERE source_system = 'LGD'
      AND source_code IN (
        '09',
        '0927',
        '0928',
        '092701'
      );
  `);
}

/*
 * --------------------------------------------------------------------------
 * IMPORT SQL BUILDER
 * --------------------------------------------------------------------------
 *
 * This adapter deliberately remains outside the importer core.
 */

function buildUpsertSql(plan) {
  const values =
    plan.operations
      .map(
        operation => {
          const row =
            operation.row;

          const canonicalSlug =
            row.canonical_name
              .toLowerCase()
              .replace(
                /[^a-z0-9]+/g,
                "-"
              )
              .replace(
                /^-|-$/g,
                ""
              );

          const currentRoute =
            "/" +
            row.location_type
              .toLowerCase() +
            "/" +
            row.source_code
              .toLowerCase() +
            "/";

          return `(
            ${sqlString(
              row.location_type
            )},
            ${sqlString(
              row.canonical_name
            )},
            ${sqlString(
              canonicalSlug
            )},
            ${sqlString(
              currentRoute
            )},
            ${sqlString(
              row.source_system
            )},
            ${sqlString(
              row.source_code
            )},
            ${sqlString(
              row.parent_source_code
            )}
          )`;
        }
      )
      .join(",\n");

  return `
    INSERT INTO public.location_registry (
      location_type,
      canonical_name,
      canonical_slug,
      current_route,
      source_system,
      source_code,
      parent_source_code
    )
    VALUES
      ${values}
    ON CONFLICT (
      source_system,
      location_type,
      source_code
    )
    WHERE
      source_system IS NOT NULL
      AND source_code IS NOT NULL
    DO UPDATE SET
      canonical_name =
        EXCLUDED.canonical_name,

      canonical_slug =
        EXCLUDED.canonical_slug,

      current_route =
        EXCLUDED.current_route,

      parent_source_code =
        EXCLUDED.parent_source_code,

      updated_at =
        now();
  `;
}

/*
 * --------------------------------------------------------------------------
 * EXPLICIT DATABASE ADAPTER
 * --------------------------------------------------------------------------
 */

async function persistenceAdapter(
  importPlan
) {
  const sql = `
    BEGIN;

    ${buildUpsertSql(
      importPlan
    )}

    COMMIT;
  `;

  return runPsql(sql);
}

/*
 * --------------------------------------------------------------------------
 * BUILD IMPORT PLAN
 * --------------------------------------------------------------------------
 */

const plan =
  importer.buildImportPlan(
    fixture,
    {
      parentIdentityBySourceCode
    }
  );

/*
 * --------------------------------------------------------------------------
 * MAIN TEST SUITE
 * --------------------------------------------------------------------------
 */

async function main() {

  /*
   * ------------------------------------------------------------------------
   * 1. DATABASE BOUNDARY
   * ------------------------------------------------------------------------
   */

  await test(
    "database connection is isolated localhost PostgreSQL",
    () => {
      assert.equal(
        DB.host,
        "127.0.0.1"
      );

      assert.equal(
        DB.database,
        "ils_test"
      );

      const database =
        runPsql(
          "SELECT current_database();"
        );

      assert.equal(
        database,
        "ils_test"
      );
    }
  );

  /*
   * ------------------------------------------------------------------------
   * 2. FIXTURE PLAN
   * ------------------------------------------------------------------------
   */

  await test(
    "LGD fixture produces four import operations",
    () => {
      assert.equal(
        plan.count,
        4
      );

      assert.equal(
        plan.operations.length,
        4
      );
    }
  );

  /*
   * ------------------------------------------------------------------------
   * 3. CLEAN TEST SCOPE
   * ------------------------------------------------------------------------
   */

  await test(
    "test fixture scope can be reset",
    () => {
      resetFixtureRows();

      const count =
        Number(
          runPsql(`
            SELECT count(*)
            FROM public.location_registry
            WHERE source_system = 'LGD'
              AND source_code IN (
                '09',
                '0927',
                '0928',
                '092701'
              );
          `)
        );

      assert.equal(
        count,
        0
      );
    }
  );

  /*
   * ------------------------------------------------------------------------
   * 4. FIRST IMPORT
   * ------------------------------------------------------------------------
   */

  await test(
    "first LGD fixture import persists four rows",
    () => {
      runPsql(`
        BEGIN;

        ${buildUpsertSql(
          plan
        )}

        COMMIT;
      `);

      const count =
        Number(
          runPsql(`
            SELECT count(*)
            FROM public.location_registry
            WHERE source_system = 'LGD'
              AND source_code IN (
                '09',
                '0927',
                '0928',
                '092701'
              );
          `)
        );

      assert.equal(
        count,
        4
      );
    }
  );

  /*
   * ------------------------------------------------------------------------
   * 5. TYPED IDENTITY READ-BACK
   * ------------------------------------------------------------------------
   */

  await test(
    "typed LGD identities are persisted correctly",
    () => {
      const rows =
        runPsql(`
          SELECT
            source_system || ':' ||
            location_type || ':' ||
            source_code
          FROM public.location_registry
          WHERE source_system = 'LGD'
            AND source_code IN (
              '09',
              '0927',
              '0928',
              '092701'
            )
          ORDER BY
            source_system,
            location_type,
            source_code;
        `)
          .split("\n")
          .filter(Boolean);

      assert.deepEqual(
        rows,
        [
          "LGD:DISTRICT:0927",
          "LGD:DISTRICT:0928",
          "LGD:STATE:09",
          "LGD:TEHSIL:092701"
        ]
      );
    }
  );

  /*
   * ------------------------------------------------------------------------
   * 6. PARENT READ-BACK
   * ------------------------------------------------------------------------
   *
   * IMPORTANT:
   * ORDER BY source_code is lexical.
   *
   * Therefore:
   *   092701
   * comes before
   *   0928
   */

  await test(
    "parent source codes are persisted correctly",
    () => {
      const rows =
        runPsql(`
          SELECT
            source_code || '=' ||
            COALESCE(
              parent_source_code,
              'NULL'
            )
          FROM public.location_registry
          WHERE source_system = 'LGD'
            AND source_code IN (
              '09',
              '0927',
              '0928',
              '092701'
            )
          ORDER BY source_code;
        `)
          .split("\n")
          .filter(Boolean);

      assert.deepEqual(
        rows,
        [
          "09=NULL",
          "0927=09",
          "092701=0927",
          "0928=09"
        ]
      );
    }
  );

  /*
   * ------------------------------------------------------------------------
   * 7. SAME CODE / DIFFERENT TYPE
   * ------------------------------------------------------------------------
   *
   * The existing fixture contains:
   *
   *   LGD:STATE:09
   *
   * We temporarily insert:
   *
   *   LGD:DISTRICT:09
   *
   * inside a transaction and verify both can coexist.
   *
   * The transaction is rolled back.
   */

  await test(
    "typed identity prevents false collision",
    () => {
      const stateCount =
        Number(
          runPsql(`
            SELECT count(*)
            FROM public.location_registry
            WHERE source_system = 'LGD'
              AND location_type = 'STATE'
              AND source_code = '09';
          `)
        );

      assert.equal(
        stateCount,
        1
      );

      const collisionOutput =
        runPsql(`
          BEGIN;

          INSERT INTO public.location_registry (
            location_type,
            canonical_name,
            canonical_slug,
            current_route,
            source_system,
            source_code
          )
          VALUES (
            'DISTRICT',
            'Same Code District',
            'same-code-district',
            '/fixture/same-code-district/',
            'LGD',
            '09'
          );

          SELECT count(*)
          FROM public.location_registry
          WHERE source_system = 'LGD'
            AND source_code = '09';

          ROLLBACK;
        `);

      const collisionCount =
        extractLastNumericValue(
          collisionOutput
        );

      assert.equal(
        collisionCount,
        2
      );
    }
  );

  /*
   * ------------------------------------------------------------------------
   * 8. IDEMPOTENT SECOND IMPORT
   * ------------------------------------------------------------------------
   */

  await test(
    "second identical import does not create duplicates",
    () => {
      runPsql(`
        BEGIN;

        ${buildUpsertSql(
          plan
        )}

        COMMIT;
      `);

      const count =
        Number(
          runPsql(`
            SELECT count(*)
            FROM public.location_registry
            WHERE source_system = 'LGD'
              AND source_code IN (
                '09',
                '0927',
                '0928',
                '092701'
              );
          `)
        );

      assert.equal(
        count,
        4
      );
    }
  );

  /*
   * ------------------------------------------------------------------------
   * 9. EXPLICIT IMPORTER ADAPTER
   * ------------------------------------------------------------------------
   *
   * This test is awaited properly.
   */

  await test(
    "importer explicit persistence adapter boundary works",
    async () => {
      const result =
        await importer.executeImportPlan(
          plan,
          persistenceAdapter
        );

      assert.equal(
        result.source_system,
        "LGD"
      );

      assert.equal(
        result.count,
        4
      );
    }
  );

  /*
   * ------------------------------------------------------------------------
   * 10. POST-ADAPTER READ-BACK
   * ------------------------------------------------------------------------
   */

  await test(
    "adapter persistence remains idempotent",
    () => {
      const count =
        Number(
          runPsql(`
            SELECT count(*)
            FROM public.location_registry
            WHERE source_system = 'LGD'
              AND source_code IN (
                '09',
                '0927',
                '0928',
                '092701'
              );
          `)
        );

      assert.equal(
        count,
        4
      );
    }
  );

  /*
   * ------------------------------------------------------------------------
   * 11. FINAL DATABASE COUNT
   * ------------------------------------------------------------------------
   */

  await test(
    "final fixture row count remains four",
    () => {
      const count =
        Number(
          runPsql(`
            SELECT count(*)
            FROM public.location_registry
            WHERE source_system = 'LGD'
              AND source_code IN (
                '09',
                '0927',
                '0928',
                '092701'
              );
          `)
        );

      assert.equal(
        count,
        4
      );
    }
  );

  /*
   * ------------------------------------------------------------------------
   * FINAL RESULT
   * ------------------------------------------------------------------------
   */

  console.log("");

  console.log(
    "=============================================="
  );

  console.log(
    "LGD POSTGRESQL INTEGRATION VERIFICATION"
  );

  console.log(
    "=============================================="
  );

  console.log(
    `PASS: ${passed}`
  );

  console.log(
    `FAIL: ${failed}`
  );

  console.log(
    `TOTAL: ${passed + failed}`
  );

  console.log(
    "=============================================="
  );

  if (
    failed > 0
  ) {
    console.error(
      "LGD_DB_INTEGRATION_TEST=FAIL"
    );

    console.log(
      "DATABASE_TARGET=LOCALHOST_TEST_POSTGRES"
    );

    console.log(
      "PRODUCTION_MODIFIED=NO"
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "LGD_DB_INTEGRATION_TEST=PASS"
  );

  console.log(
    "DATABASE_TARGET=LOCALHOST_TEST_POSTGRES"
  );

  console.log(
    "PRODUCTION_MODIFIED=NO"
  );
}

/*
 * --------------------------------------------------------------------------
 * SAFE ENTRY POINT
 * --------------------------------------------------------------------------
 */

main().catch(
  error => {
    console.error(
      error.stack ||
      error.message
    );

    console.error(
      "LGD_DB_INTEGRATION_TEST=FAIL"
    );

    console.log(
      "DATABASE_TARGET=LOCALHOST_TEST_POSTGRES"
    );

    console.log(
      "PRODUCTION_MODIFIED=NO"
    );

    process.exitCode = 1;
  }
);
