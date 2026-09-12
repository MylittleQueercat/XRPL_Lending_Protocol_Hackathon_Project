import { describe, expect, it, vi } from "vitest";
import { Wallet } from "xrpl";
import { requestFundedTestWallet } from "../src/lib/faucet";

function fixture() {
  const generated = Wallet.generate();
  const persistWallet = vi.fn();
  const accountExists = vi.fn(async () => true);
  const fetcher = vi.fn(async () => new Response(JSON.stringify({account:{address:generated.classicAddress,secret:generated.seed}})));
  return { generated, options:{faucetUrl:"https://faucet.invalid/accounts",persistWallet,accountExists,fetcher,isCurrent:()=>true,sleep:async()=>{}} };
}
describe("faucet failures preserve recovery without activating a signer", () => {
  it("saves the verified identity before a funding RPC timeout", async () => {
    const {generated,options} = fixture();
    options.accountExists.mockImplementation(async () => {
      expect(options.persistWallet).toHaveBeenCalledTimes(1);
      expect(options.persistWallet.mock.calls[0]![0].classicAddress).toBe(generated.classicAddress);
      throw new Error("RPC timeout");
    });
    await expect(requestFundedTestWallet(options)).rejects.toThrow(/saved.*Reload/);
    expect(options.fetcher).toHaveBeenCalledTimes(1);
  });
  it("surfaces faucet HTTP failure without persistence or funding lookup", async () => {
    const {options} = fixture(); options.fetcher.mockResolvedValue(new Response("", {status:503}));
    await expect(requestFundedTestWallet(options)).rejects.toThrow("503");
    expect(options.persistWallet).not.toHaveBeenCalled(); expect(options.accountExists).not.toHaveBeenCalled();
  });
  it("rejects a mismatched seed/address before persisting", async () => {
    const {generated,options} = fixture();
    options.fetcher.mockResolvedValue(new Response(JSON.stringify({account:{address:Wallet.generate().classicAddress,secret:generated.seed}})));
    await expect(requestFundedTestWallet(options)).rejects.toThrow(/does not match/);
    expect(options.persistWallet).not.toHaveBeenCalled();
  });
  it("retains delayed funding and performs only one faucet request", async () => {
    const {options} = fixture(); options.accountExists.mockResolvedValue(false);
    await expect(requestFundedTestWallet(options)).rejects.toThrow(/saved.*Reload/);
    expect(options.fetcher).toHaveBeenCalledTimes(1); expect(options.persistWallet).toHaveBeenCalledTimes(1);
  });
  it("cancels before spending faucet resources and stops if persistence fails", async () => {
    const {options} = fixture();
    await expect(requestFundedTestWallet({...options,isCurrent:()=>false})).rejects.toThrow(/cancelled/);
    expect(options.fetcher).not.toHaveBeenCalled();
    options.persistWallet.mockImplementation(() => {throw new Error("storage blocked");});
    await expect(requestFundedTestWallet(options)).rejects.toThrow("storage blocked");
    expect(options.accountExists).not.toHaveBeenCalled();
  });
});
