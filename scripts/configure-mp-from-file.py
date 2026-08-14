import os
import pathlib
import re
import sys


credentials_path = pathlib.Path(sys.argv[1]).resolve()
env_path = pathlib.Path(sys.argv[2]).resolve()
credentials = credentials_path.read_text(encoding="utf-8")


def field(name: str, required: bool = False) -> str:
    match = re.search(
        rf'''["']?{re.escape(name)}["']?\s*[:=]\s*["']([^"'\r\n]+)["']''',
        credentials,
        re.IGNORECASE,
    )
    value = match.group(1).strip() if match else ""
    if required and not value:
        raise SystemExit(f"Campo obrigatorio ausente: {name}")
    return value


token = field("accessToken", required=True)
if not re.fullmatch(r"(?:APP_USR|TEST)-[A-Za-z0-9_-]+", token):
    raise SystemExit("Access Token do Mercado Pago invalido")

expiration = field("checkoutExpirationMinutes") or "30"
if not expiration.isdigit():
    raise SystemExit("Expiracao do checkout invalida")

updates = {
    "MERCADO_PAGO_ACCESS_TOKEN": token,
    "MERCADO_PAGO_CLIENT_ID": field("clientId", required=True),
    "MERCADO_PAGO_CLIENT_SECRET": field("clientSecret", required=True),
    "MERCADO_PAGO_PUBLIC_KEY": field("publicKey", required=True),
    "MERCADO_PAGO_CURRENCY_ID": field("currencyId") or "BRL",
    "MERCADO_PAGO_MODE": field("mode") or ("production" if token.startswith("APP_USR-") else "sandbox"),
    "MERCADO_PAGO_PIX_EXPIRATION_MINUTES": expiration,
}
current = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
for key, value in updates.items():
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
    if pattern.search(current):
        current = pattern.sub(f"{key}={value}", current)
    else:
        current = current.rstrip() + f"\n{key}={value}\n"

temporary = env_path.with_suffix(env_path.suffix + ".tmp")
temporary.write_text(current, encoding="utf-8")
os.chmod(temporary, 0o600)
temporary.replace(env_path)
os.chmod(env_path, 0o600)
credentials_path.unlink(missing_ok=True)
print("Mercado Pago configurado sem exibir credenciais")
