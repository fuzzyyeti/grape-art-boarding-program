import * as anchor from "@project-serum/anchor";

import { GrapeCollectionState } from "../target/types/grape_collection_state";
import {PublicKey, LAMPORTS_PER_SOL, SystemProgram, Keypair} from "@solana/web3.js"
import {expect} from "chai";

describe("grape-collection-state", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.GrapeCollectionState as anchor.Program<GrapeCollectionState>;


  const collectionOwner = anchor.web3.Keypair.generate();
  const verifiedCollectionAddress = anchor.web3.Keypair.generate();
  const collectionUpdateAuthority = anchor.web3.Keypair.generate();
  const auctionHouse = anchor.web3.Keypair.generate();
  const META_DATA_URL = 'https://shdw-drive.genesysgo.net/6MM7GSocTFnAtwevaeyzj4eB1TSYKwx17cduKXExZAut/verified_collections.json'

  it("Is initialized!", async () => {

    // Set up payer
    const latestBlockHash = await provider.connection.getLatestBlockhash()
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: await provider.connection.requestAirdrop(collectionOwner.publicKey, LAMPORTS_PER_SOL * 1.1)
    }
    );

    // Create a config and set an admin key
    const adminKey = anchor.web3.Keypair.generate();
    const configKey = anchor.web3.Keypair.generate();
    console.log("admin key", adminKey.publicKey.toBuffer())
    const configInit = await program.methods.initializeConfig(adminKey.publicKey).accounts({
      adminConfig: configKey.publicKey,
      funder: collectionOwner.publicKey,
      systemProgram: SystemProgram.programId
    }).signers([collectionOwner, configKey]).rpc();
    console.log('config init tx sig', configInit)
    let config = await program.account.config.fetch(configKey.publicKey);
    expect(config.admin).to.eql(adminKey.publicKey);

    // Set up collection
    const [collectionBoardingInfo, bump] = await PublicKey
    .findProgramAddress([
        anchor.utils.bytes.utf8.encode("collection-boarding"),
      verifiedCollectionAddress.publicKey.toBuffer()], program.programId);

    console.log('address found', collectionBoardingInfo.toBase58(), bump)
    const tx = await program.methods.initialize(
      "Loquacious Ladybugs",
      collectionUpdateAuthority.publicKey,
      auctionHouse.publicKey,
      META_DATA_URL
    ).accounts(
    {
      collectionBoardingInfo,
      collectionOwner: collectionOwner.publicKey,
      verifiedCollectionAddress: verifiedCollectionAddress.publicKey,
      systemProgram: SystemProgram.programId,
      adminConfig: configKey.publicKey
    }
    ).signers([collectionOwner]).rpc();
    console.log("Your transaction signature", tx);
    let collection = await program.account.collectionBoardingInfo.fetch(collectionBoardingInfo);
    expect(collection.verifiedCollectionAddress).to.eql(verifiedCollectionAddress.publicKey);
    expect(collection.collectionUpdateAuthority).to.eql(collectionUpdateAuthority.publicKey);
    expect(collection.auctionHouse).to.eql(auctionHouse.publicKey);
    expect(collection.isDaoApproved).is.false;
    expect(collection.hasMarketplaceToken).is.false;
    expect(collection.name).to.eql("Loquacious Ladybugs");
    expect(collection.metaDataUrl).to.eql(META_DATA_URL);
    expect(collection.adminConfig).to.eql(configKey.publicKey);

    // Approve a collection


    // Approve collection
    const approveTx = await program.methods.approve(true
    ).accounts({
        collectionBoardingInfo,
        admin: adminKey.publicKey,
        adminConfig: configKey.publicKey
    }).signers([adminKey]).rpc();
    collection = await program.account.collectionBoardingInfo.fetch(collectionBoardingInfo);
    expect(collection.isDaoApproved).is.true;

    // Unapprove the collection
    const unapproveTx = await program.methods.approve(false
    ).accounts({
        collectionBoardingInfo,
        admin: adminKey.publicKey,
        adminConfig: configKey.publicKey
    }).signers([adminKey]).rpc();
    collection = await program.account.collectionBoardingInfo.fetch(collectionBoardingInfo);
    expect(collection.isDaoApproved).is.false;

    const newAdminKey = anchor.web3.Keypair.generate();
    const udpateAdminTx = await program.methods.updateConfig(newAdminKey.publicKey
    ).accounts({
        admin: adminKey.publicKey,
        adminConfig: configKey.publicKey
    }).signers([adminKey]).rpc()
    config = await program.account.config.fetch(configKey.publicKey);
    expect(config.admin).to.eql(newAdminKey.publicKey);

    // Make sure old admin does not work anymore
    program.methods.approve(true
    ).accounts({
        collectionBoardingInfo,
        admin: adminKey.publicKey,
        adminConfig: configKey.publicKey
    }).signers([adminKey]).rpc()
    .then(() => { throw new Error("Wrong admin should fail")})
    .catch(e => {expect(e.error.code).to.eql('ConstraintHasOne');
                expect(e.error.number).to.eql( 2001);
    });

    // Verify that new admin approve works
    const newAdminApproveTx = await program.methods.approve(true
    ).accounts({
      collectionBoardingInfo,
      admin: newAdminKey.publicKey,
      adminConfig: configKey.publicKey,
    }).signers([newAdminKey]).rpc();
    collection = await program.account.collectionBoardingInfo.fetch(collectionBoardingInfo);
    expect(collection.isDaoApproved).is.true;

    // Verify token set
    const setHasTokenTx = await program.methods.hasToken(true
    ).accounts({
      collectionBoardingInfo,
      admin: newAdminKey.publicKey,
      adminConfig: configKey.publicKey,
    }).signers([newAdminKey]).rpc();
    collection = await program.account.collectionBoardingInfo.fetch(collectionBoardingInfo);
    expect(collection.hasMarketplaceToken).is.true;

    // Verify token unset
    const unsetHasTokenTx = await program.methods.hasToken(false
    ).accounts({
      collectionBoardingInfo,
      admin: newAdminKey.publicKey,
      adminConfig: configKey.publicKey,
    }).signers([newAdminKey]).rpc();
    collection = await program.account.collectionBoardingInfo.fetch(collectionBoardingInfo);
    expect(collection.hasMarketplaceToken).is.false;

  });
});
