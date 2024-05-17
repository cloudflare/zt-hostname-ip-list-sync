resource "cloudflare_worker_cron_trigger" "hostname-list-sync" {
  account_id  = var.CF_ACCOUNT_TAG
  script_name = cloudflare_worker_script.hostname-list-sync.name
  schedules = [
    var.CRON_SCHEDULE
  ]

  depends_on = [cloudflare_worker_script.hostname-list-sync]
}

resource "cloudflare_worker_script" "hostname-list-sync" {
  account_id = var.CF_ACCOUNT_TAG
  name       = "zerotrust-hostname-list-sync"

  plain_text_binding {
    name = "DOH_ENDPOINT_ID"
    text = cloudflare_teams_location.doh.doh_subdomain
  }

  plain_text_binding {
    name = "ZT_LIST_ID"
    text = cloudflare_teams_list.hostnames.id
  }

  plain_text_binding {
    name = "ZT_ACCOUNT_TAG"
    text = var.CF_ACCOUNT_TAG
  }

  secret_text_binding {
    name = "CF_ZT_API_TOKEN" # User is required to generate and supply Worker API Token. Requires List Read/Write Permissions.
    text = var.WORKER_ZEROTRUST_LISTS_TOKEN
  }

  module     = true
  content    = file("${path.root}/src/index.js")
  depends_on = [cloudflare_teams_list.hostnames, cloudflare_teams_location.doh]
}
