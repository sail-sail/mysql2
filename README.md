# mysql2

MySQL client for Deno with focus on performance. Supports prepared statements, non-utf8 encodings, binary log protocol, compression much more

fock by https://github.com/sidorares/node-mysql2

## usage
```ts
import * as mysql2 from "https://deno.land/x/mysql2/mod.ts";

const pool = mysql2.createPool({
  host: "127.0.0.1",
  port: 3306,
  user: "test_user",
  password: "test_password",
  database: "nest_database",
  connectionLimit: 4,
});
const result = await pool.query("SELECT 1");
console.log(result[0]); // [ { "1": 1 } ]
await pool.end();
```
