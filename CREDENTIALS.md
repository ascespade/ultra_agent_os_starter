# Ultra Agent OS – Login Credentials

## Local Docker

| Field    | Value                    |
|----------|--------------------------|
| Username | `admin`                  |
| Password | `SecureAdminPassword2024!` |

Set in `docker-compose.yml` via `DEFAULT_ADMIN_PASSWORD`.

## Railway

Username is always `admin`.

Password comes from the `DEFAULT_ADMIN_PASSWORD` variable in the Railway dashboard.  
Railway can generate it; if you don’t see it, set it manually in Variables.

## Changing the password

1. Update `DEFAULT_ADMIN_PASSWORD` in your environment.
2. Restart the API so the password is synced on startup.
