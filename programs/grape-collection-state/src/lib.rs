use anchor_lang::prelude::*;
use anchor_lang::solana_program::native_token::LAMPORTS_PER_SOL;
/*

Need to make a InitializeConfig
Config just has approver authority
PDAs need to be derived from the config account
client will know the real config account
only original signer can update config account
but approver can be modified by the master key
 */
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const FEE: u64 = LAMPORTS_PER_SOL;
//ADMIN_ADDRESS = "71VQ9rieZPrw5TADjU3nXGRtxAhZLwKdn7URP5wsG8T8"
#[program]
pub mod grape_collection_state {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>,
                      name: String,
                      collection_update_authority: Pubkey,
                      auction_house: Pubkey,
                      meta_data_url: String) -> Result<()> {
        // Pay fee to initialize collection listing request
      //  let seeds = [b"collection-boarding", collection_update_authority];
       // let [expecected_collection_boarding_info, bump]  = find_pda(seeds, ctx.program_id);
 //       let collection_owner = ctx.accounts.collection_owner.to_account_info();
 //       let escrow = ctx.accounts.escrow.to_account_info();
//        **collection_owner.try_borrow_mut_lamports()? -= FEE;
    //    **escrow.try_borrow_mut_lamports()? += FEE;
        // Initialize account
        ctx.accounts.collection_boarding_info.name = name;
        ctx.accounts.collection_boarding_info.verified_collection_address = ctx.accounts.verified_collection_address.key();
        ctx.accounts.collection_boarding_info.collection_update_authority = collection_update_authority;
        ctx.accounts.collection_boarding_info.auction_house = auction_house;
        ctx.accounts.collection_boarding_info.meta_data_url = meta_data_url;
        ctx.accounts.collection_boarding_info.is_dao_approved = false;
        ctx.accounts.collection_boarding_info.has_marketplace_token = false;
        ctx.accounts.collection_boarding_info.bump = *ctx.bumps.get("collection_boarding_info").unwrap();
        ctx.accounts.collection_boarding_info.admin_config = ctx.accounts.admin_config.key();
        Ok(())
    }

    pub fn approve(ctx: Context<Admin>, is_approved: bool) -> Result<()> {
        ctx.accounts.collection_boarding_info.is_dao_approved = is_approved;
        Ok(())
    }

    pub fn has_token(ctx: Context<Admin>, has_token: bool) -> Result<()> {
        ctx.accounts.collection_boarding_info.has_marketplace_token = has_token;
        Ok(())
    }

    pub fn initialize_config(ctx: Context<InitializeConfig>, admin: Pubkey) -> Result<()> {
        ctx.accounts.admin_config.admin = admin;
        Ok(())
    }

    pub fn update_config(ctx: Context<UpdateConfig>, new_admin: Pubkey) -> Result<()> {
        ctx.accounts.admin_config.admin = new_admin;
        Ok(())
    }

}


#[derive(Accounts)]
pub struct InitializeConfig<'info> {
   #[account(init,
    payer = funder,
    space = 8 + 32)]
    pub admin_config: Account<'info, Config>,
   #[account(mut)]
    pub funder: Signer<'info>,
    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, has_one = admin)]
    pub admin_config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>
}

#[derive(Accounts)]
pub struct Admin<'info> {
    #[account(mut, has_one = admin_config)]
    pub collection_boarding_info: Account<'info, CollectionBoardingInfo>,
    pub admin: Signer<'info>,
    #[account(has_one = admin)]
    pub admin_config: Account<'info, Config>
 //   #[account(mut)]
 //   pub escrow: AccountInfo<'info>
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init,
    payer = collection_owner,
    // space: 8 discriminator + 4 name length + 200 name + 32 verified_collection_address
    // + 32 collection_update_authority + 1 is_dao_approved + 1 has_marketplace_token
    // + 32 auction_house + 32 admin_config + 4 meta_data_url length + 200 meta_data_url + 1 bump
    space = 8 + 4 + 200 + 32 + 32 + 1 + 1 + 32 + 32 + 4 + 200 + 1,
    seeds = [b"collection-boarding", verified_collection_address.key().as_ref()],
    bump)]
    pub collection_boarding_info: Account<'info, CollectionBoardingInfo>,
    #[account(mut)]
    pub collection_owner: Signer<'info>,
    /// CHECK: I don't know what I'm doing yet
    pub verified_collection_address: UncheckedAccount<'info>,
  /// CHECK: I don't know what I'm doing yet
//    pub escrow: AccountInfo<'info>,
    pub admin_config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Config {
    admin: Pubkey
}

#[account]
pub struct CollectionBoardingInfo {
    name: String,
    verified_collection_address: Pubkey,
    collection_update_authority: Pubkey,
    is_dao_approved: bool,
    has_marketplace_token: bool,
    auction_house: Pubkey,
    meta_data_url: String,
    admin_config: Pubkey,
    bump: u8
}