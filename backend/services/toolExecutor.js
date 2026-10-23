const axios =
require("axios");

const {
 getTool
}=
require("./toolRegistry");

const {
 notifyLead,
 sendSlackText
}=
require("./notificationService");


async function executeTool(
 toolName,
 payload={}
){

 try{

  const tool=
  getTool(
   toolName
  );

  if(
   !tool
  ){

   throw new Error(
    `Tool not found: ${toolName}`
   );

  }


  console.log(
   "[toolExecutor] executing:",
   toolName
  );

  // Avoid logging transcripts, lead PII, or other tool payloads.


  if(
   tool.type==="webhook"
  ){

   const response=
   await axios({

    method:
    tool.method ||
    "POST",

    url:
    tool.url,

    data:
    payload,

    timeout:
    10000,

    headers:{

     "Content-Type":
     "application/json"

    }

   });


   console.log(
    "[toolExecutor] success:",
    response.data
   );


   return{

    success:true,

    tool:
    toolName,

    data:
    response.data

   };

  }


  if (tool.type === "slack_message") {
   const text = String(payload.text || payload.message || "").trim();
   if (!text) throw new Error("Slack notification text is required");
   const outcome = await sendSlackText(text);
   return { success: outcome.sent.includes("slack"), tool: toolName, data: outcome,
    ...(outcome.sent.length === 0 && { error: outcome.skipped ? "Slack is not configured" : "Slack delivery failed" }) };
  }

  if(
   tool.type==="notification"
  ){

   const outcome=
   await notifyLead(
    payload
   );

   console.log(
    "[toolExecutor] notification:",
    outcome
   );

   return{

    success:
    outcome.sent.length>0,

    tool:
    toolName,

    data:
    outcome,

    ...(outcome.sent.length===0 && {
     error:
     outcome.skipped
      ? "No notification channel configured"
      : "All notification channels failed"
    })

   };

  }


  throw new Error(
   "Unsupported tool type"
  );

 }catch(
  err
 ){

  console.error(
   "[toolExecutor] FAILED:",
   err.message
  );


  if(
   err.response
  ){

   console.error(
    "[toolExecutor] response:",
    err.response.data
   );

  }


  return{

   success:false,

   tool:
   toolName,

   error:
   err.message

  };

 }

}


module.exports={

 executeTool

};