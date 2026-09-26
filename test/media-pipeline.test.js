import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgasServer } from "../src/server.js";
import { Store } from "../src/store.js";

test("a brand campaign requires six reviewed stages before a scoped, hashed local publication packet",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-media-flow-")),db=join(root,"agas.db"),vault=join(root,"vault");
  const {server}=createAgasServer({database:db,vault,token:"media-test",adapters:{}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(path,method="GET",data) {
    const res=await fetch(base+path,{method,headers:{authorization:"Bearer media-test",
      ...(data?{"content-type":"application/json"}:{})},body:data?JSON.stringify(data):undefined});
    return {status:res.status,data:await res.json()};
  }
  try {
    const brand=(await request("/api/projects","POST",{hubId:"content",kind:"media-brand",title:"Studio",description:"Brand"})).data.project;
    const other=(await request("/api/projects","POST",{hubId:"content",kind:"media-brand",title:"Other",description:"Separate brand"})).data.project;
    async function account(projectId,handle){return (await request("/api/media/accounts","POST",{projectId,platform:"youtube",handle,niche:"Education",language:"English"})).data.account}
    const owned=await account(brand.id,"Studio Channel"),foreign=await account(other.id,"Other Channel");
    const campaign=(await request("/api/media/campaigns","POST",{projectId:brand.id,title:"First video",objective:"A cited explanation"})).data.campaign;
    const packetPath=`/api/media/campaigns/${campaign.id}/packets`;
    assert.equal((await request(packetPath,"POST",{accountId:owned.id,expectedVersion:1})).status,409);
    let version=1;
    for(const stage of ["research","strategy","creation","editing","media","review"]) {
      const artifactPath=`/api/media/campaigns/${campaign.id}/artifacts`;
      if(stage==="research")assert.equal((await request(artifactPath,"POST",{title:"No sources",content:"Draft",sources:[],expectedVersion:version})).status,400);
      if(stage==="review")assert.equal((await request(artifactPath,"POST",{title:"Missing rights",content:"Draft",sources:[],expectedVersion:version})).status,400);
      const sent=await request(artifactPath,"POST",{title:stage,content:`Verified draft for ${stage}`,
        sources:stage==="research"?["https://example.com/research"]:[],
        rightsNote:stage==="review"?"Owner checked attribution and rights for a local packet":"",expectedVersion:version});
      assert.equal(sent.status,201);
      const artifact=sent.data.artifacts.at(-1);
      assert.equal(artifact.stage,stage);
      assert.equal(artifact.status,"submitted");
      assert.equal(sent.data.campaign.status,"awaiting-review");
      version=sent.data.campaign.version;
      const reviewed=await request(`${artifactPath}/${artifact.id}/review`,"POST",{
        decision:"accepted",reviewNote:`Owner approved ${stage}`,expectedVersion:version});
      assert.equal(reviewed.status,200);
      version=reviewed.data.campaign.version;
      assert.equal((await request(`${artifactPath}/${artifact.id}/review`,"POST",{
        decision:"accepted",reviewNote:"Duplicate",expectedVersion:version})).status,409);
    }
    assert.equal((await request(`/api/media/campaigns/${campaign.id}`)).data.campaign.status,"ready-for-publishing");
    assert.equal((await request(packetPath,"POST",{accountId:foreign.id,expectedVersion:version})).status,409);
    const prepared=await request(packetPath,"POST",{accountId:owned.id,expectedVersion:version});
    assert.equal(prepared.status,201);
    assert.equal(prepared.data.packet.status,"prepared");
    assert.equal(prepared.data.packet.sha256,createHash("sha256").update(prepared.data.packet.content).digest("hex"));
    assert.equal(JSON.parse(prepared.data.packet.content).artifacts.length,6);
    assert.equal((await request(packetPath,"POST",{accountId:owned.id,expectedVersion:version})).status,409);
    assert.equal((await request("/api/vault/project","POST",{})).status,200);
    assert.match(await readFile(join(vault,"03 Missions",`${campaign.id}.md`),"utf8"),new RegExp(prepared.data.packet.sha256));
    await new Promise(resolve=>server.close(resolve));
    const restored=new Store(db);
    assert.equal(restored.mediaCampaignDetail(campaign.id).packets[0].status,"prepared");
    assert.equal(restored.mediaCampaignDetail(campaign.id).campaign.status,"ready-for-publishing");
    restored.close();
  } finally {if(server.listening)await new Promise(resolve=>server.close(resolve))}
});
