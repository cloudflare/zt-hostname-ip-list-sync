terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

variable "CF_TOKEN" {}
variable "CF_ACCOUNT_TAG" {}

provider "cloudflare" {
  api_token = var.CF_TOKEN
}