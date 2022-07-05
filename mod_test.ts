import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import * as mysql2 from "./mod.ts";

Deno.test("query", async function() {
  const pool = mysql2.createPool({
    host: "127.0.0.1",
    port: 3306,
    user: "test_user",
    password: "test_password",
    database: "nest_database",
    connectionLimit: 4,
  });
  const result = await pool.query("SELECT 1");
  await pool.end();
  assertEquals(result[0], [ { "1": 1 } ]);
});
