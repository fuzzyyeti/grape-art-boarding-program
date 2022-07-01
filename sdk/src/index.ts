import {useConnection, useWallet} from "@solana/wallet-adapter-react";
import {PublicKey} from "@solana/web3.js";
const CONFIGURATION_KEY = '48Q8knLizS8LN9GTBqTnseUeoB7FsayJhpvX7QMHC166'

export type CollectionBoardingInfo = {
    name: string, // Maximum 200 characters
    verified_collection_address: PublicKey,
    collection_update_authority: PublicKey,
    auction_house: PublicKey,
    meta_data_url: string, // Maximum 200 characters
}

export const useAdmin = () => {
    const wallet = useWallet()
    const connection = useConnection()
    return {
        createConfig: async () => {},

        updateAdmin: async (newAdmin: PublicKey) => {},

        approve: async (verifiedCollectionAddress: PublicKey) => {},

        deny: async (verifiedCollectionAddress: PublicKey) => {}
    }
}

export const useListingRequest = (configurationKey = new PublicKey(CONFIGURATION_KEY)) => {
    const wallet = useWallet()
    const connection = useConnection()
    return {
        requestListng: async (collectionBoardingInfo: CollectionBoardingInfo) => {

        },
        requestRefund: async (verifiedCollectionAddress: PublicKey) => {
        }
    }
}

export const useListingQuery = (configurationKey = new PublicKey(CONFIGURATION_KEY)) => {
    const connection = useConnection()
    return {
        //Must be approved by admin and token in listing requestor's wallet
        getAllApprovedListings: async () : Promise<CollectionBoardingInfo[]> => {
            return []
        },
        //
        isApproved: async (verifiedCpllectionAddress: PublicKey) => {
            return true
        },
        hasToken: async (verifiedCollectionAddress: PublicKey) => {
            return true
        }
    }
}