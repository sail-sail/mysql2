##

https://mysqlserverteam.com/mysql-8-0-4-new-default-authentication-plugin-caching_sha2_password/

```ts
import { createConnection } from "mysql2";

createConnection({
  authPlugins: {
    caching_sha2_password: mysql.authPlugins.caching_sha2_password({
      onServerPublikKey: function(key) {
        console.log(key);
      },
      serverPublicKey: 'xxxyyy',
      overrideIsSecure: true //
    }),
  }
});
```
