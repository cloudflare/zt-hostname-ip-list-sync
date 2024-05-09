output "hostname-list-url" {
  value       = "https://one.dash.cloudflare.com/${var.CF_ACCOUNT_TAG}/team/lists/${cloudflare_teams_list.hostnames.id}"
  description = "URL in dashboard to create hostnames."
}

output "cron-events-url" {
    value = "https://dash.cloudflare.com/${var.CF_ACCOUNT_TAG}/workers/services/view/${cloudflare_worker_script.hostname-list-sync.name}/production/logs/cron"
}