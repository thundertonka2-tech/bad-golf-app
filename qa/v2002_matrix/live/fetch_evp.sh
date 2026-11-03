#!/bin/bash
# Fetch the public event page payload (the exact RPC the public page calls) as an anonymous viewer.
KEY='sb_publishable_E9m7sOEyM0MgrNuX2u2Smw_5_jYcl7A'
curl -sS -X POST "https://ojclesuwxhtzvrymqrwg.supabase.co/rest/v1/rpc/bg_event_page" -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"p_tid":"a2002000-0000-4000-8000-00000000e001","p_key":"QA2002PAGEKEY01"}' -o "$1"
