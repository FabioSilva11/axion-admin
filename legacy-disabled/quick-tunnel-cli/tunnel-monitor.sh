#!/bin/bash
# Monitora o túnel Cloudflare e atualiza a URL no Firebase Realtime Database

FIREBASE_DB="https://axion-badfa-default-rtdb.firebaseio.com"
FIREBASE_KEY="AIzaSyB8WQUTlwCyQOxpY8x3MYu0GzVKeHSD3uE"
FIREBASE_EMAIL="tunnel-publisher@axion-badfa.firebaseapp.com"
FIREBASE_PASS="nSqd2OMpsfL8rtl9mW1u"
CLOUDFLARED_LOG="/opt/CLIProxyAPI/logs/cloudflared.log"
LAST_URL_FILE="/opt/CLIProxyAPI/logs/.last_tunnel_url"
TOKEN_FILE="/opt/CLIProxyAPI/logs/.firebase_token"
TOKEN_EXPIRES_FILE="/opt/CLIProxyAPI/logs/.firebase_token_expires"

ID_TOOLKIT="https://identitytoolkit.googleapis.com/v1"

firebase_sign_in() {
    local response
    response=$(curl -s -X POST \
        "${ID_TOOLKIT}/accounts:signInWithPassword?key=${FIREBASE_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${FIREBASE_EMAIL}\",\"password\":\"${FIREBASE_PASS}\",\"returnSecureToken\":true}")

    local id_token
    id_token=$(echo "$response" | grep -oP '"idToken"\s*:\s*"\K[^"]+')
    local expires_in
    expires_in=$(echo "$response" | grep -oP '"expiresIn"\s*:\s*"\K[^"]+')

    if [ -z "$id_token" ]; then
        echo "[$(date)] ERRO: Falha no login Firebase" >&2
        return 1
    fi

    echo "$id_token" > "$TOKEN_FILE"
    local expires_at
    expires_at=$(( $(date +%s) + ${expires_in:-3600} - 300 ))
    echo "$expires_at" > "$TOKEN_EXPIRES_FILE"
    echo "[$(date)] Firebase Auth: token renovado"
}

firebase_token() {
    if [ -f "$TOKEN_FILE" ] && [ -f "$TOKEN_EXPIRES_FILE" ]; then
        local expires_at
        expires_at=$(cat "$TOKEN_EXPIRES_FILE")
        if [ "$(date +%s)" -lt "$expires_at" ]; then
            cat "$TOKEN_FILE"
            return 0
        fi
    fi
    firebase_sign_in && cat "$TOKEN_FILE"
}

get_current_url() {
    grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' "$CLOUDFLARED_LOG" | tail -1
}

send_to_firebase() {
    local url="$1"
    local online="$2"
    local token
    token=$(firebase_token)
    if [ -z "$token" ]; then
        echo "[$(date)] ERRO: Sem token Firebase, ignorando envio" >&2
        return 1
    fi
    local generation
    generation=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")
    local timestamp
    timestamp=$(date +%s%3N 2>/dev/null || echo "0")

    local payload
    payload=$(printf '{"endpoint":"%s","online":%s,"streaming":false,"tunnelType":"quick","generation":"%s","updatedAt":%s}' \
        "$url" "$online" "$generation" "$timestamp")

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
        "${FIREBASE_DB}/config/cli-proxy.json?auth=${token}" \
        -H "Content-Type: application/json" \
        -d "$payload")

    if [ "$http_code" = "200" ]; then
        echo "[$(date)] URL atualizada no Firebase (config/cli-proxy)"
    elif [ "$http_code" = "401" ]; then
        echo "[$(date)] Token expirado, renovando..."
        token=$(firebase_sign_in && cat "$TOKEN_FILE")
        if [ -n "$token" ]; then
            retry_code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
                "${FIREBASE_DB}/config/cli-proxy.json?auth=${token}" \
                -H "Content-Type: application/json" \
                -d "$payload")
            if [ "$retry_code" = "200" ]; then
                echo "[$(date)] URL atualizada no Firebase (config/cli-proxy) [retry]"
            else
                echo "[$(date)] ERRO: Firebase retornou HTTP $retry_code no retry" >&2
            fi
        fi
    else
        echo "[$(date)] ERRO: Firebase retornou HTTP $http_code" >&2
    fi
}

echo "Iniciando monitoramento do tunnel..."

firebase_sign_in

LAST_URL=""
if [ -f "$LAST_URL_FILE" ]; then
    LAST_URL=$(cat "$LAST_URL_FILE")
fi

while true; do
    CURRENT_URL=$(get_current_url)

    if [ -n "$CURRENT_URL" ] && [ "$CURRENT_URL" != "$LAST_URL" ]; then
        echo "[$(date)] Novo tunnel detectado: $CURRENT_URL"
        send_to_firebase "$CURRENT_URL" "true"
        echo "$CURRENT_URL" > "$LAST_URL_FILE"
        LAST_URL="$CURRENT_URL"
    fi

    sleep 10
done
