# Zero Trust - Hostname IP List Synchronization

This Terraform module configures Cloudflare Workers to synchronize DNS hostnames with Zero Trust IP lists. This enables writing Gateway Network policies based on Destination IP address for services using changing or dynamic IP addresses.

## Prerequisites

- You have a Cloudflare Zero Trust account. See https://developers.cloudflare.com/cloudflare-one/.
- Terraform is installed on your device. See https://developer.hashicorp.com/terraform/install.

## Installation

### Generate API Tokens

This script requires two Cloudflare API tokens. See [Developer Docs](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) for guidance on provisioning API tokens. Available API permissions are documented [here](https://developers.cloudflare.com/fundamentals/api/reference/permissions/).
#### WORKER_ZEROTRUST_LISTS_TOKEN

This API token is used by the Worker script to read and write Zero Trust Lists. This requires the following permissions:

- Zero Trust Read
- Zero Trust Edit

#### CF_TOKEN

This API token is used by Terraform to provision the environment. This API token requires the following permissions:

- Zero Trust Read
- Zero Trust Edit
- Worker Scripts Read
- Worker Scripts Edit

## Deployment

- Copy `terraform.tfvars.example` to `terraform.tfvars`
- Define values in `terraform.tfvars`:
	- CF_ACCOUNT_TAG: This is your Account ID. See [Find zone and account IDs](https://developers.cloudflare.com/fundamentals/setup/find-account-and-zone-ids/).
	- WORKER_ZEROTRUST_LISTS_TOKEN: Generated above.
	- CF_TOKEN: Generated above.
- `terraform init`
- `terraform apply`

## Usage

### Adding hostnames to Zero Trust lists

Once deployed you will have a new List available in the Zero Trust dashboard named: `Integration: Hostname IP Source List (Do Not Delete)`.  The Worker cron uses this script to identify hostnames to synchronize with Zero Trust lists.

You can add hostnames to this list via API, CSV or manually. See [Developer Docs: Lists](https://developers.cloudflare.com/cloudflare-one/policies/gateway/lists/) for more information.

Once a hostname is added, a new list will be automatically generated the next time the Worker cron executes. This takes roughly a minute.

### Using Hostname Lists in Firewall Policies

Hostname lists can be referenced using the *in list* operator. For example to block traffic to example.com you can write a Firewall policy such as:

Selector: `Destination IP`
Operator: `in list`
Value: `Destination IPs for example.com`

### Support for Private DNS resolution

The Worker resolves DNS using a DoH Location configured in your Zero Trust dashboard. In order for the Worker to resolve and synchronize Private Hostnames to IP Lists a Resolver Policy must be separately configured.

See [Developer Docs: Resolver policies](https://developers.cloudflare.com/cloudflare-one/policies/gateway/resolver-policies/) for more information.

## Known limitations

### Subrequest limits

This script is subject to Worker [subrequest limits](https://developers.cloudflare.com/workers/platform/limits/). The script performs the following requests:

- One to request the list of hostnames.
- Three per hostname:
	- One to perform DNS-over-HTTPs resolution.
	- One to fetch the hostname list.
	- One to patch the hostname list with added and removed IPs.

At the time of writing, this means this script is limited to:

- 399 hostnames on Workers Unbound.
- 16 hostnames on Workers Standard.

Please contact your account team if you require increased limits.

## List limits

By default Zero Trust limits accounts to [100 lists](https://developers.cloudflare.com/cloudflare-one/account-limits/). Please contact your account team if you require increased limits.

### Geographic DNS

This script executes as a [Worker Cron Trigger](https://developers.cloudflare.com/workers/configuration/cron-triggers/) which runs on underutilized machines on Cloudflare's global network. Geographic DNS may lead to unexpected results as the script executes in different locations around the world and receives different DNS answers.

## Roadmap

- AAAA / IPv6 Records
