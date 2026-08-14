const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim() ?? "";

if (!accessToken) {
  console.log(JSON.stringify({ configured: false, valid: false, httpStatus: null }));
  process.exit(1);
}

try {
  const response = await fetch("https://api.mercadolibre.com/users/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = await response.json().catch(() => ({}));
  console.log(JSON.stringify({
    configured: true,
    valid: response.ok,
    httpStatus: response.status,
    error: response.ok ? null : (body.message ?? body.error ?? "unknown_error"),
  }));
  process.exit(response.ok ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({
    configured: true,
    valid: false,
    httpStatus: null,
    error: error instanceof Error ? error.message : "network_error",
  }));
  process.exit(1);
}
