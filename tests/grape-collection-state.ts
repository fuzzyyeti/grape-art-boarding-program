import * as anchor from "@project-serum/anchor";

import { GrapeCollectionState } from "../target/types/grape_collection_state";
import {PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js"
import {expect} from "chai";

describe("grape-collection-state", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.GrapeCollectionState as anchor.Program<GrapeCollectionState>;


  const listingRequestor = anchor.web3.Keypair.generate();
  const verifiedCollectionAddress = anchor.web3.Keypair.generate();
  const collectionUpdateAuthority = anchor.web3.Keypair.generate();
  const auctionHouse = anchor.web3.Keypair.generate();
  const META_DATA_URL = 'https://shdw-drive.genesysgo.net/6MM7GSocTFnAtwevaeyzj4eB1TSYKwx17cduKXExZAut/verified_collections.json'

  it("Complete all transitions in listing request workflow", async () => {

    // Set up payer
    const latestBlockHash = await provider.connection.getLatestBlockhash()
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: await provider.connection.requestAirdrop(listingRequestor.publicKey, LAMPORTS_PER_SOL * 10)
    }
    );

    // Create a config and set an admin key
    const adminKey = anchor.web3.Keypair.generate();
    const configKey = anchor.web3.Keypair.generate();
    await program.methods.initializeConfig(adminKey.publicKey)
        .accounts({
          adminConfig: configKey.publicKey,
          funder: listingRequestor.publicKey,
          systemProgram: SystemProgram.programId})
        .signers([listingRequestor, configKey]).rpc();
    let config = await program.account.config.fetch(configKey.publicKey);
    expect(config.admin).to.eql(adminKey.publicKey);

    // Set up collection
    const [collectionBoardingInfo, bump] = await PublicKey
    .findProgramAddress([
        anchor.utils.bytes.utf8.encode("collection-boarding"),
      verifiedCollectionAddress.publicKey.toBuffer()], program.programId);

    let payFeeTx = new anchor.web3.Transaction().add(SystemProgram.transfer({
      fromPubkey: listingRequestor.publicKey,
      toPubkey: collectionBoardingInfo,
      lamports: LAMPORTS_PER_SOL * 1.1}));
    let payFeeTxResult = await anchor.web3.sendAndConfirmTransaction(provider.connection,
        payFeeTx, [listingRequestor])

    await program.methods.initializeListingRequest(
      "Loquacious Ladybugs",
      collectionUpdateAuthority.publicKey,
      auctionHouse.publicKey,
      META_DATA_URL)
        .accounts(
    {
          collectionBoardingInfo,
          listingRequestor: listingRequestor.publicKey,
          verifiedCollectionAddress: verifiedCollectionAddress.publicKey,
          adminConfig: configKey.publicKey,
          systemProgram: SystemProgram.programId
        })
        .signers([listingRequestor]).rpc();

    let collection = await program.account.collectionListingRequest.fetch(collectionBoardingInfo);
    expect(collection.verifiedCollectionAddress).to.eql(verifiedCollectionAddress.publicKey);
    expect(collection.collectionUpdateAuthority).to.eql(collectionUpdateAuthority.publicKey);
    expect(collection.auctionHouse).to.eql(auctionHouse.publicKey);
    expect(collection.isDaoApproved).is.false;
    expect(collection.name).to.eql("Loquacious Ladybugs");
    expect(collection.metaDataUrl).to.eql(META_DATA_URL);
    expect(collection.adminConfig).to.eql(configKey.publicKey);

    // Approve collection
    await program.methods.approve(true)
        .accounts({
            collectionBoardingInfo,
            admin: adminKey.publicKey,
            adminConfig: configKey.publicKey,
            listingRequestor: listingRequestor.publicKey})
        .signers([adminKey]).rpc();
    collection = await program.account.collectionListingRequest.fetch(collectionBoardingInfo);
    expect(collection.isDaoApproved).is.true;
    let adminAccount = await provider.connection.getAccountInfo(adminKey.publicKey);
    expect(adminAccount.lamports).to.eql(LAMPORTS_PER_SOL);

    //Deny the collection
    let returnFeeTx = new anchor.web3.Transaction().add(SystemProgram.transfer({
      fromPubkey: listingRequestor.publicKey,
      toPubkey: collectionBoardingInfo,
      lamports: LAMPORTS_PER_SOL * .99}));
    await anchor.web3.sendAndConfirmTransaction(provider.connection,
        returnFeeTx, [listingRequestor])

    expect(adminAccount.lamports).to.eql(LAMPORTS_PER_SOL);
    await program.methods.approve(false)
        .accounts({
            collectionBoardingInfo,
            admin: adminKey.publicKey,
            adminConfig: configKey.publicKey,
            listingRequestor: listingRequestor.publicKey})
        .signers([adminKey]).rpc();
    collection = await program.account.collectionListingRequest.fetch(collectionBoardingInfo);
    expect(collection.isDaoApproved).is.false;

    // Give up control to new admin account
    const newAdminKey = anchor.web3.Keypair.generate();
    await program.methods.updateConfig(newAdminKey.publicKey)
        .accounts({
            admin: adminKey.publicKey,
            adminConfig: configKey.publicKey})
        .signers([adminKey]).rpc()
    config = await program.account.config.fetch(configKey.publicKey);
    expect(config.admin).to.eql(newAdminKey.publicKey);

    // Make sure old admin does not work anymore
    program.methods.approve(true)
        .accounts({
            collectionBoardingInfo,
            admin: adminKey.publicKey,
            adminConfig: configKey.publicKey,
            listingRequestor: listingRequestor.publicKey})
        .signers([adminKey]).rpc()
    .then(() => { throw new Error("Wrong admin should fail")})
    .catch(e => {expect(e.error.code).to.eql('ConstraintHasOne');
                expect(e.error.number).to.eql( 2001);});

      // Verify that new admin approve works
      // Reload account with approval fee
    payFeeTx = new anchor.web3.Transaction().add(SystemProgram.transfer({
      fromPubkey: listingRequestor.publicKey,
      toPubkey: collectionBoardingInfo,
      lamports: LAMPORTS_PER_SOL * 1.2})); // Had to change the value each funding event.
      // The same transaction can't be sent close together
    await anchor.web3.sendAndConfirmTransaction(provider.connection,
        payFeeTx, [listingRequestor]);

    await program.methods.approve(true)
        .accounts({
          collectionBoardingInfo,
          admin: newAdminKey.publicKey,
          adminConfig: configKey.publicKey,
          listingRequestor: listingRequestor.publicKey})
        .signers([newAdminKey]).rpc();
    collection = await program.account.collectionListingRequest.fetch(collectionBoardingInfo);
    expect(collection.isDaoApproved).is.true;


    // Reload fee to allow refund
    payFeeTx = new anchor.web3.Transaction().add(SystemProgram.transfer({
      fromPubkey: listingRequestor.publicKey,
      toPubkey: collectionBoardingInfo,
      lamports: LAMPORTS_PER_SOL * 1.3})); // Had to change the value. Seems same transaction can't be sent close together
    await anchor.web3.sendAndConfirmTransaction(provider.connection,
        payFeeTx, [listingRequestor]);

    let listingRequestorAccount = await provider.connection.getAccountInfo(listingRequestor.publicKey);
    const beforeLamports = listingRequestorAccount.lamports;
    let boardingInfoAccount = await provider.connection.getAccountInfo(collectionBoardingInfo);
    const closingLamports = boardingInfoAccount.lamports
    expect(closingLamports).to.be.gt(0);

    // Request a refund and close account
    await program.methods.requestRefund()
        .accounts({
          collectionBoardingInfo: collectionBoardingInfo,
          listingRequestor: listingRequestor.publicKey})
        .signers([listingRequestor]).rpc();

    listingRequestorAccount = await provider.connection.getAccountInfo(listingRequestor.publicKey);
    const afterLamports = listingRequestorAccount.lamports;
    expect(afterLamports).to.be.gt(beforeLamports);
    boardingInfoAccount = await provider.connection.getAccountInfo(collectionBoardingInfo);
    expect(boardingInfoAccount).to.eql(null);
    expect(closingLamports).to.eql(afterLamports - beforeLamports);
  });
});
