import { describe, expect, it } from "vitest";
import { buildEmbedLink, createEmbedNotification, embedDestination, parseEmbedQuery } from "../src/lib/embed";
describe("optional full-page integration boundary", () => {
  it("requires an unambiguous explicit network and only a vault context", () => {
    for(const query of [{}, {network:"4002"}, {network:["4001","4002"]}, {network:"4001",seed:"marker"}, {network:"4001",vault:"wrong"}]) expect(()=>parseEmbedQuery(query)).toThrow();
    expect(embedDestination(parseEmbedQuery({network:"4001",vault:"a".repeat(64)}))).toBe(`/position?vault=${"A".repeat(64)}`);
  });
  it("builds deployment links without arbitrary redirects", () => {
    expect(buildEmbedLink("http://localhost:3000",{network:4001})).toBe("http://localhost:3000/embed?network=4001");
    for(const origin of ["javascript:alert(1)","http://example.com","https://user:pass@example.com","https://example.com/path"]) expect(()=>buildEmbedLink(origin,{network:4001})).toThrow();
  });
  it("exposes only a generic status after an explicit local opt-in", () => {
    expect(createEmbedNotification("pending",false)).toBeNull();
    expect(createEmbedNotification("pending",true)).toEqual({type:"raise.status",version:1,status:"pending"});
    expect(()=>createEmbedNotification("secret" as never,true)).toThrow();
  });
});
