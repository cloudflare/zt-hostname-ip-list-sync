variable "CF_TOKEN" {}
variable "CF_ACCOUNT_TAG" {}

variable "CRON_SCHEDULE" {
  type    = string
  default = "* * * * *"
}

variable "WORKER_ZEROTRUST_LISTS_TOKEN" {
  type    = string
  sensitive = true
}