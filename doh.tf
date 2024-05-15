resource "cloudflare_teams_location" "doh" {
  account_id     = var.CF_ACCOUNT_TAG
  name           = "Integration: Hostname IP Lists DNS-over-HTTPS endpoint (Do Not Delete)"
}