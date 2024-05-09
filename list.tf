resource "cloudflare_teams_list" "hostnames" {
  account_id  = var.CF_ACCOUNT_TAG
  name        = "Integration: Hostname IP Source List (Do Not Delete)"
  type        = "DOMAIN"
  description = "Hostnames added to this list will create and synchronise IP lists for use in firewall policies."

  lifecycle {
    ignore_changes = [
      items # This is critical to prevent future `terraform apply` actions from purging the list.
    ]
  }
}