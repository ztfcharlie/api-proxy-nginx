
### veo-3.1-fast-generate-preview  --- 文本生视频
~~~ 
curl --location 'http://74.249.29.91:8888/v1/projects/carbide-team-478005-f8/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-preview:predictLongRunning' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer gemini-client-key-hulaoban' \
--data '{
  "instances": [
    {
      "prompt": "A beautiful sunset over the ocean with gentle waves",
      "videoConfig": {
        "duration": "5s",
        "aspectRatio": "16:9",
        "quality": "high",
        "fps": 24
      }
    }
  ]
}
'
~~~ 

### veo-3.1-fast-generate-preview  --- 获取视频
~~~ 
curl --location 'http://74.249.29.91:8888/v1/projects/carbide-team-478005-f8/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-preview:fetchPredictOperation' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer gemini-client-key-hulaoban' \
--data '{
  "operationName": "projects/carbide-team-478005-f8/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-preview/operations/d5975555-1353-4637-95cf-abfba474c6b2"
}'
~~~ 

### gemini-3-pro-preview  --- streamGenerateContent
~~~ 
curl --location 'http://74.249.29.91:8888/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-3-pro-preview:streamGenerateContent?alt=sse' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer gemini-client-key-hulaoban' \
--data '{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "艾滋病现在有了治疗的药物没？"
        }
      ]
    }
  ]
}'
~~~ 


### gemini-3-pro-preview
~~~ 
curl --location 'http://74.249.29.91:8888/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-3-pro-preview:generateContent' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer gemini-client-key-hulaoban' \
--data '{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "艾滋病现在有了治疗的药物没？"
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 1024
  }
}'
~~~ 

### gemini-embedding-001
~~~ 
curl --location 'http://74.249.29.91:8888/v1/projects/carbide-team-478005-f8/locations/us-central1/publishers/google/models/gemini-embedding-001:predict' \
--header 'x-goog-api-key: aaa' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer gemini-client-key-hulaoban' \
--data '{
    "instances":[
        {
        "content":"What is the meaning of life?",
        "task_type": "RETRIEVAL_DOCUMENT"
        }
    ]
}'
~~~ 