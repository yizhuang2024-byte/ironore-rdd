#!/usr/bin/env bash
# 開發用 PostgreSQL 啟動腳本。
#
# 本專案不使用 docker-compose 做本機開發 —— 容器環境中 Docker daemon 未必運行，
# 而 PostgreSQL 16 已直接安裝於系統。正式部署請改用 repo 根目錄的 docker-compose.yml。
#
# 用法：./scripts/dev-db.sh [start|stop|status|reset-test]
set -euo pipefail

CLUSTER_VERSION=16
CLUSTER_NAME=main
DB_USER=ltc
DB_PASSWORD=ltc
DEV_DB=ltc_dev
TEST_DB=ltc_test

ensure_running() {
  if ! pg_isready -q 2>/dev/null; then
    echo "→ 啟動 PostgreSQL ${CLUSTER_VERSION}/${CLUSTER_NAME}…"
    sudo pg_ctlcluster "$CLUSTER_VERSION" "$CLUSTER_NAME" start
    # pg_ctlcluster 回傳後 server 可能尚未接受連線
    for _ in $(seq 1 20); do
      pg_isready -q 2>/dev/null && break
      sleep 0.5
    done
  fi
  pg_isready
}

ensure_roles_and_dbs() {
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
    echo "→ 建立使用者 ${DB_USER}"
    sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}' SUPERUSER;"
  fi
  for db in "$DEV_DB" "$TEST_DB"; do
    if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1; then
      echo "→ 建立資料庫 ${db}"
      sudo -u postgres createdb -O "$DB_USER" "$db"
    fi
  done
}

case "${1:-start}" in
  start)
    ensure_running
    ensure_roles_and_dbs
    echo "✓ ${DEV_DB} / ${TEST_DB} 就緒於 localhost:5432"
    ;;
  stop)
    sudo pg_ctlcluster "$CLUSTER_VERSION" "$CLUSTER_NAME" stop
    ;;
  status)
    pg_isready
    ;;
  reset-test)
    # 只重建測試庫，永不觸碰開發庫
    ensure_running
    echo "→ 重建 ${TEST_DB}（僅測試庫）"
    sudo -u postgres dropdb --if-exists "$TEST_DB"
    sudo -u postgres createdb -O "$DB_USER" "$TEST_DB"
    echo "✓ ${TEST_DB} 已重建，請執行 pnpm --filter @ltc/api db:migrate:deploy"
    ;;
  *)
    echo "用法: $0 [start|stop|status|reset-test]" >&2
    exit 1
    ;;
esac
