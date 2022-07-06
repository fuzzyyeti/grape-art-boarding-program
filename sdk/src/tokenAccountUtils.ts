
import BN from "bn.js";
import {deserialize} from "borsh";
class TokenAccount {
    mint = new Uint8Array(32);
    owner= new Uint8Array(32);
    amount = new BN(0);
    delegate = new Uint8Array(32);
    state = 0;
    is_native = new BN(0);
    delegated_amount = new BN(0);
    close_authority = new Uint8Array(32);

    constructor(fields: {
        mint: Uint8Array,
        owner: Uint8Array,
        amount: BN,
        delegate: Uint8Array,
        state: number,
        is_native: BN,
        delegated_amount: BN,
        close_authroity: Uint8Array}) {
        if (fields) {
            this.mint = fields.mint;
            this.owner = fields.owner;
            this.amount = fields.amount;
            this.delegate = fields.delegate;
            this.state = fields.state;
            this.is_native = fields.is_native;
            this.delegated_amount = fields.delegated_amount;
            this.close_authority = fields.close_authroity;
        }
    }
}

const TokenAccountSchema = new Map([
        [TokenAccount, {kind: 'struct', fields: [
                ['mint', [32]],
                ['owner',[32]],
                ['amount','u64'],
                ['delegate',[32]],
                ['state','u8'],
                ['is_native', 'u64'],
                ['delegated_amount', 'u64'],
                ['close_authority', [32]],
                ['nothing', 'u64'],
                ['nothing2','u32']]}]]);


export const deserializeTokenAccount = (tokenAccountData: Buffer) => {
    return deserialize(
        TokenAccountSchema,
        TokenAccount,
        tokenAccountData,
    );
}
