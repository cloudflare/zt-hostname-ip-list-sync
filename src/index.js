export default {
	async fetch(event, env, ctx) {
		return new Response('Not Implemented', { status: 501 });
	},
	async scheduled(event, env, ctx) {
		const ACCOUNT_TAG = env.ZT_ACCOUNT_TAG;
		if (!ACCOUNT_TAG) throw new Error('ZT_ACCOUNT_TAG is required');
		const API_BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_TAG}`;

		const DOH_ID = env.DOH_ENDPOINT_ID;
		if (!DOH_ID) throw new Error('DOH_ENDPOINT_ID is required');

		const LIST_ID = env.ZT_LIST_ID;
		if (!LIST_ID) throw new Error('ZT_LIST_ID is required');

		const CF_ZT_API_TOKEN = env.CF_ZT_API_TOKEN;
		if (!CF_ZT_API_TOKEN) throw new Error('CF_ZT_API_TOKEN is required');

		const domainListItems = await getZeroTrustListItems(env, API_BASE_URL, LIST_ID);

		const allZTLists = await listZeroTrustLists(env, API_BASE_URL);

		const domains = domainListItems.map((item) => item.value);
		let wasSuccessful = true;

		// Iterate over domains in list
		for (const domain of domains) {
			const destinationIPList = await getDestinationIPs(domain, DOH_ID);

			if (!destinationIPList) continue;

			// Wrap each destination IP in an object in order to construct the payload for the createZeroTrustList request
			const newIPListItems = destinationIPList.map((item) => {
				const val = {
					value: item,
				};
				return val;
			});

			const newListName = `FQDN: ${domain}`;
			const listDesc = `Resolved IPs for ${domain} (Do Not Edit Description)`;
			const data = {
				name: newListName,
				description: listDesc,
				items: newIPListItems,
				type: 'IP',
			};
			console.log('New List Data:', data);

			// Iterate through exisiting list.
			// If it exits then pull the list items and patch the list
			// Other if it doesn't exist then create a new list
			let listResp;
			const exisitingList = allZTLists.find((list) => list.description == listDesc);
			if (exisitingList) {
				// PATCH (update)
				const newData = {
					append: [],
					remove: [],
				};
				const existingIPListItems = await getZeroTrustListItems(env, API_BASE_URL, exisitingList.id);

				// Remove any items from the existing list that are not present in the new list
				existingIPListItems.forEach((item) => {
					if (newIPListItems.findIndex((newItem) => newItem.value == item.value) == -1) {
						newData.remove.push(item.value);
					}
				});

				// Add any items that are not present in existing list to the append list
				newIPListItems.forEach((newItem) => {
					if (existingIPListItems.findIndex((item) => item.value == newItem.value) == -1) {
						newData.append.push(newItem);
					}
				});

				if (newData.append.length > 0 || newData.remove.length > 0) {
					listResp = await patchZeroTrustList(env, API_BASE_URL, exisitingList.id, newData);
					console.log(`Updated ${exisitingList?.name} list:`, listResp?.result);
				} else {
					console.log('List values have not changed. No patch Call necessary.');
				}
			} else {
				// POST (create)
				listResp = await createZeroTrustList(env, API_BASE_URL, data);

				console.log('Created new list:', listResp?.result);
			}
		}

		console.log(`trigger fired at ${event.cron}: ${wasSuccessful}`);
	},
};

async function listZeroTrustLists(env, baseUrl) {
	// Fetch the list of ZT Lists
	const listZTListsReq = new Request(`${baseUrl}/gateway/lists`, {
		method: 'GET',
		headers: {
			accept: 'application/json',
			authorization: `Bearer ${env.CF_ZT_API_TOKEN}`,
		},
	});
	const listZTListsResp = await fetch(listZTListsReq);
	const listZTListsRespJson = await listZTListsResp.json();
	if (!listZTListsResp.ok) throw new Error(`Failed to fetch Zero Trust Lists... Response: ${listZTListsRespJson}`);

	const results = listZTListsRespJson?.result;
	console.log('Zero Trust Lists:', results);
	if (!results || results.length == 0) {
		throw new Error('Could not find any Zero Trust lists. Exiting...');
	}

	return results;
}

async function getZeroTrustListItems(env, baseUrl, id) {
	// Fetch all of the items within the "RESOLVER_HOSTS" tagged list
	const getZTListItemsReq = new Request(`${baseUrl}/gateway/lists/${id}/items`, {
		method: 'GET',
		headers: {
			accept: 'application/json',
			authorization: `Bearer ${env.CF_ZT_API_TOKEN}`,
		},
	});
	const getZTListItemsResp = await fetch(getZTListItemsReq);
	const getZTListItemsRespJson = await getZTListItemsResp.json();
	if (!getZTListItemsResp.ok) throw new Error(`Failed to fetch list items. Exiting... Response: ${getZTListItemsRespJson}`);

	const results = getZTListItemsRespJson?.result;
	console.log('Zero Trust List items:', results);
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
	const dohRespJson = await dohResp.json();
	if (!dohResp.ok) throw new Error(`Failed to fetch destination IPs. Exiting... Response: ${dohRespJson}`);

	let results = dohRespJson?.Answer;
	console.log('DOH Query Results:', results);
	if (!results || results.length == 0) {
		console.warn(`No IPs found for ${domain}.`);
		return false;
	}

	// only keep results that have an IPv4 address
	results = results.filter(({ type }) => type == 1).map(({ data }) => data);
	return results;
}

async function createZeroTrustList(env, baseUrl, data) {
	const createZTListReq = new Request(`${baseUrl}/gateway/lists`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			accept: 'application/json',
			authorization: `Bearer ${env.CF_ZT_API_TOKEN}`,
		},
		body: JSON.stringify(data),
	});
	const createZTListResp = await fetch(createZTListReq);
	const createZTListRespJson = await createZTListResp.json();
	if (!createZTListResp.ok) throw new Error(`Failed to create new list. Exiting... Response: ${createZTListRespJson}`);

	return createZTListRespJson;
}

async function patchZeroTrustList(env, baseUrl, id, data) {
	const patchZTListReq = new Request(`${baseUrl}/gateway/lists/${id}`, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			accept: 'application/json',
			authorization: `Bearer ${env.CF_ZT_API_TOKEN}`,
		},
		body: JSON.stringify(data),
	});

	const patchZTListResp = await fetch(patchZTListReq);
	const patchZTListRespJson = await patchZTListResp.json();
	if (!patchZTListResp.ok) throw new Error(`Failed to patch list. Exiting... Response: ${patchZTListRespJson}`);

	return patchZTListRespJson;
}
