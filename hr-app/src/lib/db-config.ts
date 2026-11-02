// Turns DATABASE_URL ("mysql://user:password@host:3306/database") into the MariaDB
// driver's pool settings. Shared by the app (src/lib/db.ts) and the seed script.
export function mariadbConfig(url: string | undefined) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const u = new URL(url);
  if (u.protocol !== "mysql:" && u.protocol !== "mariadb:") {
    throw new Error("DATABASE_URL must start with mysql:// (MariaDB / MySQL)");
  }
  return {
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    // A small office app: a handful of connections is plenty
    connectionLimit: Number(process.env.DATABASE_POOL_MAX) || 5,
  };
}
