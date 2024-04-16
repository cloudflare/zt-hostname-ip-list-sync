/**
 * Welcome to Cloudflare Workers!
 *
 * This is a template for a Scheduled Worker: a Worker that can run on a
 * configurable interval:
 * https://developers.cloudflare.com/workers/platform/triggers/cron-triggers/
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	// The scheduled handler is invoked at the interval set in our wrangler.toml's
	// [[triggers]] configuration.
	async fetch(req, env, ctx) {
		// A Cron Trigger can make requests to other endpoints on the Internet,
		// publish to a Queue, query a D1 Database, and much more.
		//
		// Verify that env variables are present
		const LIST_TAG = 'RESOLVER_HOSTS';
		const API_BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${env.API_ACCOUNT_ID}`;
		const DOH_ID = env.DOH_ID;
		if (!DOH_ID) throw new Error('DOH_ID is required');

		const CF_API_TOKEN = env.CF_API_TOKEN;
		if (!CF_API_TOKEN) throw new Error('CF_API_TOKEN is required');

		const gatewayLists = await listGatewayLists(env);

		// For now lets filter by name
		const filteredLists = gatewayLists.filter((item) => item.description == LIST_TAG);
		const listID = filteredLists[0].id;
		if (!listID) {
			throw new Error('Could not find ID for list with "RESOLVER_HOSTS" attribute');
		}

		const domainListItems = await getGatewayListItems(env);

		const domains = domainListItems.map((item) => item.value);
		let wasSuccessful = true;

		// Iterate over domains in list
		for (const domain of domains) {
			const destinationIPList = await getDestinationIPs(domain, DOH_ID);
			if (destinationIPList.length == 0) {
				wasSuccessful = false;
				throw new Error(`No destination IPs found for ${domain}`);
			}

			// Wrap each destination IP in an object in order to construct the payload for the createGatewayList request
			const newIPListItems = destinationIPList.map((item) => {
				const val = {
					value: item.ip,
				};
				return val;
			});
			const data = {
				name: `FQDN: ${domain}`,
				description: `Destination IP for ${domain}`,
				items: newIPListItems,
				type: 'IP',
			};
			console.log('Data:', data);
			await createGatewayList(env, data);
		}
		// console.log(`trigger fired at ${event.cron}: ${wasSuccessful}`);
		return new Response('Success');
	},
};

async function listGatewayLists(env) {
	// Fetch the list of ZT Lists
	const listGWListsReq = new Request(`${env.API_BASE_URL}/gateway/lists`, {
		method: 'GET',
		headers: {
			accept: 'application/json',
			authorization: `Bearer ${env.CF_API_TOKEN}`,
		},
	});
	const ztListResp = await fetch(listGWListsReq);
	if (!ztListResp.ok) throw new Error('Failed to fetch');

	const ztListRespJson = await ztListResp.json();
	console.log('ListRespJson:', ztListRespJson);
	const results = ztListRespJson?.result;

	if (!results || results.length == 0) {
		throw new Error('Could not find any Gateway Lists. Exiting...');
	}

	return results;
}

async function getGatewayListItems(env) {
	// Fetch all of the items within the "RESOLVER_HOSTS" tagged list
	const getDomainItemsReq = new Request(`${env.API_BASE_URL}/gateway/lists/${listID}/items`, {
		method: 'GET',
		headers: {
			accept: 'application/json',
			authorization: `Bearer ${env.CF_API_TOKEN}`,
		},
	});
	const domainListItemsResp = await fetch(getDomainItemsReq);
	if (!domainListItemsResp.ok) throw new Error('Failed to fetch');

	const domainListItemsRespJson = await domainListItemsResp.json();
	const results = domainListItemsRespJson?.result;
	console.log('Domain Lists:', results);

	if (!results || results.length == 0) {
		console.log('No domains in list. Exiting...');
		throw new Error('No domains in list. Exiting...');
	}

	return results;
}

async function getDestinationIPs(domain, dohId) {
	// Fetch Destination IP for domain using the DOH URL
	let dohReqURL = new URL(`https://${dohId}.cloudflare-gateway.com/dns-query`);
	dohReqURL.searchParams.set('name', domain);
	dohReqURL.searchParams.set('type', 'A');
	console.log('DOH URL:', dohReqURL);
	const dohReq = new Request(dohReqURL, {
		method: 'GET',
		headers: {
			accept: 'application/dns-json',
		},
	});
	const dohResp = await fetch(dohReq);
	if (!dohResp.ok) throw new Error('Failed to fetch');

	const dohBody = await dohResp.json();
	let results = dohBody?.Answer;

	if (!results || results.length == 0) {
		console.log(`No IPs found for ${domain}. Exiting...`);
		throw new Error(`No IPs found for ${domain}. Exiting...`);
	}

	results = results.map(({ data }) => data);

	return results;
}

async function createGatewayList(env, data) {
	const createNewListReq = new Request(`${env.API_BASE_URL}/gateway/lists`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			accept: 'application/json',
			authorization: `Bearer ${env.CF_API_TOKEN}`,
		},
		body: JSON.stringify(data),
	});
	const createNewListResp = await fetch(createNewListReq);
	if (!createNewListResp.ok) throw new Error('Failed to create new list');

	const createNewListRespJson = await createNewListResp.json();
	if (!createNewListRespJson.success) throw new Error('Failed to create new list');
	console.log('newListRespJson:', createNewListRespJson);
}
