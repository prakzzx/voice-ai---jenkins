const {
 executeTool
}=require("./toolExecutor");


const TOOL_PATTERNS={

 send_lead:[

  "save lead",
  "save this lead",
  "record lead",
  "store lead",
  "capture lead",
  "create lead"

 ]

};


// Tools that run automatically after another tool succeeds.
// Saving a lead also notifies the team via Slack / email.
const TOOL_CHAINS={

 send_lead:[
  "notify_lead"
 ]

};


function detectToolIntent(
 text=""
){

 const lower=
 text.toLowerCase();

 for(
  const [tool,patterns]
  of Object.entries(
   TOOL_PATTERNS
  )
 ){

  const matched=
  patterns.some(
   p=>lower.includes(p)
  );

  if(
   matched
  ){

   return tool;

  }

 }

 return null;

}



const callStateStore=
require("./callStateStore")

async function processToolCalls(
 conversationId,
 text
){

 const tool=
 detectToolIntent(
  text
 );

 if(
  !tool
 ){

  return [];

 }

 console.log(
  "[toolRouter] detected:",
  tool
 );

 const state=
  callStateStore.getCall(
  conversationId
  );

  const payload={

    transcript:text,

    ...(state?.collectedData||{})

  };

  const result=
  await executeTool(
  tool,
  payload
  );

  const results=[

   {

    tool,

    result

   }

  ];

  // Run chained tools (e.g. notify_lead) only if the primary tool worked.
  if(
   result.success
  ){

   for(
    const chained
    of TOOL_CHAINS[tool]||[]
   ){

    const chainedResult=
    await executeTool(
     chained,
     {

      ...(state?.collectedData||{}),

      conversationId,

      savedAt:
      new Date().toISOString()

     }
    );

    results.push({

     tool:chained,

     result:chainedResult

    });

   }

  }

 return results;

}


module.exports={

 processToolCalls

};