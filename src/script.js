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

		const zeroTrustLists = await listZeroTrustLists(env, API_BASE_URL);

		// For now lets filter by name
		const filteredLists = zeroTrustLists.filter((item) => item.description == LIST_TAG);
		const listID = filteredLists[0].id;
		if (!listID) {
			throw new Error('Could not find ID for list with "RESOLVER_HOSTS" attribute');
		}

		const domainListItems = await getZeroTrustListItems(env, API_BASE_URL, listID);

		const domains = domainListItems.map((item) => item.value);
		let wasSuccessful = true;

		// Iterate over domains in list
		for (const domain of domains) {
			const destinationIPList = await getDestinationIPs(domain, DOH_ID);
			if (destinationIPList.length == 0) {
				wasSuccessful = false;
				throw new Error(`No destination IPs found for ${domain}`);
			}

			// Wrap each destination IP in an object in order to construct the payload for the createZeroTrustList request
			const newIPListItems = destinationIPList.map((item) => {
				const val = {
					value: item,
				};
				return val;
			});

			const data = {
				name: `FQDN: ${domain}`,
				description: `Destination IPs for ${domain}`,
				items: newIPListItems,
				type: 'IP',
			};
			console.log('Data:', data);
			await createZeroTrustList(env, API_BASE_URL, data);
		}
		// console.log(`trigger fired at ${event.cron}: ${wasSuccessful}`);
		return new Response('Success');
	},
};

async function listZeroTrustLists(env, baseUrl) {
	// Fetch the list of ZT Lists
	const listZTListsReq = new Request(`${baseUrl}/gateway/lists`, {
		method: 'GET',
		headers: {
			accept: 'application/json',
			authorization: `Bearer ${env.CF_API_TOKEN}`,
		},
	});
	const listZTListsResp = await fetch(listZTListsReq);
	if (!listZTListsResp.ok) throw new Error('Failed to fetch');

	const listZTListsRespJson = await listZTListsResp.json();
	console.log('ListRespJson:', listZTListsRespJson);
	const results = listZTListsRespJson?.result;

	if (!results || results.length == 0) {
		throw new Error('Could not find any Gateway Lists. Exiting...');
	}

	return results;
}

async function getZeroTrustListItems(env, baseUrl, id) {
	// Fetch all of the items within the "RESOLVER_HOSTS" tagged list
	const getZTListItemsReq = new Request(`${baseUrl}/gateway/lists/${id}/items`, {
		method: 'GET',
		headers: {
			accept: 'application/json',
			authorization: `Bearer ${env.CF_API_TOKEN}`,
		},
	});
	const getZTListItemsResp = await fetch(getZTListItemsReq);
	if (!getZTListItemsResp.ok) throw new Error('Failed to fetch');

	const getZTListItemsRespJson = await getZTListItemsResp.json();
	const results = getZTListItemsRespJson?.result;
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

async function createZeroTrustList(env, baseUrl, data) {
	const createZTListReq = new Request(`${baseUrl}/gateway/lists`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			accept: 'application/json',
			authorization: `Bearer ${env.CF_API_TOKEN}`,
		},
		body: JSON.stringify(data),
	});
	const createZTListResp = await fetch(createZTListReq);
	if (!createZTListResp.ok) throw new Error('Failed to create new list');

	const createZTListRespJson = await createZTListResp.json();
	if (!createZTListRespJson.success) throw new Error('Failed to create new list');
	console.log('newListRespJson:', createZTListRespJson);
}