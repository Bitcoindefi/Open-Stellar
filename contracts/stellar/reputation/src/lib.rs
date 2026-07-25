#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env};

#[contract]
pub struct ReputationAttestation;

#[contractimpl]
impl ReputationAttestation {
    /// Attests that `agent_id` held `score` at `timestamp`.
    ///
    /// The caller must be the agent address. The returned BytesN<64> is a
    /// deterministic digest over the agent, score and timestamp; clients can
    /// store the returned hash and later ask the contract to verify thresholds.
    pub fn attest(env: Env, agent_id: Address, score: u32, timestamp: u64) -> BytesN<64> {
        agent_id.require_auth();
        let digest = Self::digest(&env, &agent_id, score, timestamp);
        env.storage().persistent().set(&digest, &(agent_id, score, timestamp));
        digest
    }

    /// Verifies that an attestation exists for `agent_id` and meets `min_score`.
    pub fn verify(env: Env, agent_id: Address, min_score: u32, attestation: BytesN<64>) -> bool {
        let stored = env
            .storage()
            .persistent()
            .get::<BytesN<64>, (Address, u32, u64)>(&attestation);

        match stored {
            Some((stored_agent, stored_score, _timestamp)) => stored_agent == agent_id && stored_score >= min_score,
            None => false,
        }
    }

    fn digest(env: &Env, agent_id: &Address, score: u32, timestamp: u64) -> BytesN<64> {
        let mut payload = Bytes::new(env);
        payload.append(&agent_id.to_xdr(env));
        payload.append(&score.to_be_bytes().into());
        payload.append(&timestamp.to_be_bytes().into());

        let first = env.crypto().sha256(&payload);
        let mut second_payload = Bytes::new(env);
        second_payload.append(&first.clone().into());
        second_payload.append(&payload);
        let second = env.crypto().sha256(&second_payload);

        let mut out = Bytes::new(env);
        out.append(&first.into());
        out.append(&second.into());
        BytesN::from_array(env, &out.to_array())
    }
}
