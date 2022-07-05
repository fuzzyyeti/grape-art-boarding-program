# Grape Art Marketplace - On-chain Program SDK

## Install
`yarn add [PROGRAM_REPO]/sdk`

## Usage

* Create Config
```typescript    
const { updateAdmin, createConfig } = useManageAdmin(provider);
const [tx, account] = await createConfig(new BN(LAMPORTS_PER_SOL))
```

* Create a Listing Request

```typescript
  const { requestListng  } = useListingRequest(provider, new PublicKey(CONFIG))
  const result = await requestListng({
  name: "Loquacious Ladybugs",
  auction_house: web3.Keypair.generate().publicKey,
  verified_collection_address: verifiedCollectionAddress,
  collection_update_authority: web3.Keypair.generate().publicKey,
  meta_data_url: 'http://whatever.org'
  })
```
 * Approve or Deny a listing
```typescript
    const { approveListing, denyListing } = useAdmin(provider, new PublicKey(CONFIG))
    const res = await denyListing(new PublicKey('5zL9T9M6MbMCQ4ZfkH7nwptUhPPCiUfegmjZZq8Gg1YF'));
```
* View All Approved or Denied/Pending Listings
```typescript
   const { getAllPendingListings, getAllApprovedListings, isApproved, hasToken  } = useListingQuery(provider, new PublicKey(CONFIG))
    const listings = await getAllPendingListings();
    for (let list of listings) {
        console.log('verified collection address', list.verified_collection_address.toBase58())
    }
    const approvedListings = await getAllApprovedListings();
    for (let list of approvedListings) {
        console.log('verified collection address', list.verified_collection_address.toBase58())
    }
```