import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgasServer } from "../src/server.js";
import { Store } from "../src/store.js";

test("FinOS paper cash, exposure cap, holdings, realized P&L and idempotent receipts remain deterministic",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-finance-")),db=join(root,"agas.db"),vault=join(root,"vault");
  const {server}=createAgasServer({database:db,vault,token:"finance-test",adapters:{}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(path,method="GET",data) {
    const response=await fetch(base+path,{method,headers:{authorization:"Bearer finance-test",
      ...(data?{"content-type":"application/json"}:{})},body:data?JSON.stringify(data):undefined});
    return {status:response.status,data:await response.json()};
  }
  try {
    const project=(await request("/api/projects","POST",{hubId:"finance",title:"Research",kind:"research",description:"Paper only"})).data.project;
    const other=(await request("/api/projects","POST",{hubId:"dev",title:"Code",kind:"research",description:"Not finance"})).data.project;
    assert.equal((await request("/api/finance/paper-accounts","POST",{projectId:other.id,title:"Wrong",startingCashPaise:10000})).status,400);
    const account=(await request("/api/finance/paper-accounts","POST",{projectId:project.id,title:"Sandbox",startingCashPaise:10_000_000,maxTradeBps:500})).data.account;
    const path=`/api/finance/paper-accounts/${account.id}`;
    const first=(await request(`${path}/marks`,"POST",{symbol:"NSE:EXAMPLE",pricePaise:10_000,
      sourceUrl:"https://example.org/quote",asOf:new Date().toISOString(),expectedVersion:1})).data;
    const mark=first.marks[0];
    assert.equal(first.account.version,2);
    assert.equal((await request(`${path}/orders`,"POST",{requestId:"too-big",side:"buy",quantity:60,feePaise:0,
      markId:mark.id,expectedVersion:2})).status,409);
    const buyInput={requestId:"first-buy",side:"buy",quantity:10,feePaise:100,markId:mark.id,expectedVersion:2};
    const buy=await request(`${path}/orders`,"POST",buyInput);
    assert.equal(buy.status,201);
    assert.equal(buy.data.order.status,"simulated");
    assert.equal(buy.data.detail.account.cash_paise,9_899_900);
    assert.equal(buy.data.detail.positions[0].cost_paise,100_100);
    assert.equal((await request(`${path}/orders`,"POST",buyInput)).data.order.id,buy.data.order.id);
    assert.equal((await request(`${path}/orders`,"POST",{...buyInput,quantity:11})).status,409);
    assert.equal((await request(`${path}/orders`,"POST",{requestId:"short",side:"sell",quantity:11,feePaise:0,
      markId:mark.id,expectedVersion:3})).status,409);
    const second=(await request(`${path}/marks`,"POST",{symbol:"NSE:EXAMPLE",pricePaise:12_000,
      sourceUrl:"https://example.org/new-quote",asOf:new Date().toISOString(),expectedVersion:3})).data;
    assert.equal((await request(`${path}/orders`,"POST",{requestId:"stale",side:"sell",quantity:1,feePaise:0,
      markId:mark.id,expectedVersion:4})).status,409);
    const sale=await request(`${path}/orders`,"POST",{requestId:"sell-five",side:"sell",quantity:5,
      feePaise:100,markId:second.marks[0].id,expectedVersion:4});
    assert.equal(sale.status,201);
    assert.equal(sale.data.order.realized_pnl_paise,9_850);
    assert.equal(sale.data.detail.account.cash_paise,9_959_800);
    assert.equal(sale.data.detail.positions[0].quantity,5);
    assert.equal(sale.data.detail.valuation.equity_paise,10_019_800);
    assert.equal(sale.data.detail.valuation.unrealized_pnl_paise,9_950);
    assert.equal(sale.data.detail.valuation.realized_pnl_paise,9_850);
    assert.equal((await request("/api/vault/project","POST",{})).status,200);
    assert.match(await readFile(join(vault,"02 Projects",`${account.id}.md`),"utf8"),/Simulation only/);
    await new Promise(resolve=>server.close(resolve));
    const reopened=new Store(db);
    assert.equal(reopened.paperAccountDetail(account.id).account.cash_paise,9_959_800);
    assert.equal(reopened.paperAccountDetail(account.id).orders.length,2);
    reopened.close();
  } finally {if(server.listening)await new Promise(resolve=>server.close(resolve))}
});
