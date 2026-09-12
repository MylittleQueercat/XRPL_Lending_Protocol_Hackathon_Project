import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Wallet, SubmittableTransaction } from "xrpl";

const transport = vi.hoisted(() => ({ connected: true, connect: vi.fn(), disconnect: vi.fn(), autofill: vi.fn(), submitAndWait: vi.fn(), request: vi.fn(), constructors: vi.fn() }));
vi.mock("xrpl", async (original) => {
  const actual = await original<typeof import("xrpl")>();
  return { ...actual, Client: class {
    constructor() { transport.constructors(); }
    on() {}
    isConnected() { return transport.connected; }
    connect = transport.connect;
    disconnect = transport.disconnect;
    autofill = transport.autofill;
    submitAndWait = transport.submitAndWait;
    request = transport.request;
  } };
});
let ledger: typeof import("../src/lib/ledger");
let signer: Wallet;
let rows: Map<string,string>;
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); transport.connected = true;
  transport.connect.mockResolvedValue(undefined); transport.disconnect.mockResolvedValue(undefined);
  rows = new Map();
  vi.stubGlobal("window", { localStorage: { getItem: (key:string) => rows.get(key) ?? null, setItem: (key:string,value:string) => rows.set(key,value) }, dispatchEvent() {} });
  vi.stubGlobal("navigator", { locks: { request: async (_name:string, callback:()=>unknown) => callback() } });
  ledger = await import("../src/lib/ledger");
  signer = (await import("xrpl")).Wallet.generate();
  (await import("../src/lib/signing-session")).setActiveSigner(signer);
  transport.autofill.mockImplementation(async tx => ({ ...tx, NetworkID:4001, Fee:"12", Sequence:1, LastLedgerSequence:100 }));
});
afterEach(async () => { await ledger.disconnect(); vi.unstubAllGlobals(); });
const transaction = () => ({ TransactionType:"Payment", Account:signer.classicAddress, Destination:signer.classicAddress, Amount:"1" } as SubmittableTransaction);

describe("transport and persistent submission recovery", () => {
  it("cleans up a disconnected transport before replacing it", async () => {
    await ledger.getClient(); transport.connected = false;
    await ledger.getClient();
    expect(transport.disconnect).toHaveBeenCalledTimes(1);
    expect(transport.constructors).toHaveBeenCalledTimes(2);
  });
  it("cleans up a failed connect and permits a fresh connection", async () => {
    transport.connect.mockRejectedValueOnce(new Error("timeout"));
    await expect(ledger.getClient()).rejects.toThrow("timeout");
    expect(transport.disconnect).toHaveBeenCalledTimes(1);
    await ledger.getClient(); expect(transport.connect).toHaveBeenCalledTimes(2);
  });
  it("cancels a connection that completes after explicit disconnect", async () => {
    let finish!:()=>void;
    transport.connect.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const connecting = ledger.getClient();
    await ledger.disconnect(); finish();
    await expect(connecting).rejects.toThrow(/cancel/i);
  });
  it("persists a submitted hash on timeout and refuses another broadcast after reload", async () => {
    transport.submitAndWait.mockRejectedValue(new Error("RPC timeout"));
    await expect(ledger.signAndSubmit(transaction(), signer)).rejects.toThrow(/saved for recovery/);
    expect(rows.size).toBe(1);
    vi.resetModules();
    const reloaded = await import("../src/lib/ledger");
    await expect(reloaded.signAndSubmit(transaction(), signer)).rejects.toThrow(/saved transaction/);
    expect(transport.submitAndWait).toHaveBeenCalledTimes(1);
    expect(transport.autofill).toHaveBeenCalledTimes(1);
  });
  it("does not broadcast if storage refuses the recovery record", async () => {
    vi.stubGlobal("window", { localStorage:{getItem:()=>null,setItem(){throw new Error("quota");}}, dispatchEvent(){} });
    await expect(ledger.signAndSubmit(transaction(),signer)).rejects.toThrow("quota");
    expect(transport.submitAndWait).not.toHaveBeenCalled();
  });
  it("does not sign if the wallet disconnects during autofill", async () => {
    transport.autofill.mockImplementationOnce(async tx => {
      (await import("../src/lib/signing-session")).setActiveSigner(null);
      return {...tx,NetworkID:4001,Fee:"12",Sequence:1,LastLedgerSequence:100};
    });
    const sign = vi.spyOn(signer,"sign");
    await expect(ledger.signAndSubmit(transaction(),signer)).rejects.toThrow(/disconnected/);
    expect(sign).not.toHaveBeenCalled(); expect(transport.submitAndWait).not.toHaveBeenCalled();
  });
});
