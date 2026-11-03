select set_config('request.jwt.claims', json_build_object('sub','659d5edc-f938-4900-9793-42aa4730667d','role','authenticated')::text, true);
select public.league_open_week('e6d966e5-ab95-4adf-a964-6f3da885bbc5', '{"holes":18,"pars":[4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4],"si":[9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2],"par":72,"tee":"Blue","course_name":"QA v2002 test course"}'::jsonb, false);
select public.league_post_card('1e05b984-5454-4e32-b826-df3ad08abd45', ARRAY[4, 4, 6, 3, 4, 5, 3, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 5]::int[], null, 'solo_post', null, '{}'::uuid[], 'dac3c761-7c1e-4f59-b57a-df38abb21d3f');
select public.league_post_card('386bd66d-d495-4c56-85af-c78d9ea96f46', ARRAY[4, 4, 6, 3, 4, 5, 3, 3, 5, 4, 4, 3, 4, 5, 4, 6, 3, 5]::int[], null, 'solo_post', null, '{}'::uuid[], 'fcfe640d-bbe5-49b5-84d0-c8fe24820d5a');
select public.league_post_card('1e05b984-5454-4e32-b826-df3ad08abd45', ARRAY[5, 4, 7, 3, 4, 5, 5, 3, 5, 5, 4, 3, 4, 5, 6, 7, 3, 5]::int[], null, 'solo_post', null, '{}'::uuid[], 'b05ea29f-b0f4-4d59-a627-48bf8dbdbb98');
select public.league_post_card('bec2a77d-11e0-4305-87f5-6fa16007cae0', ARRAY[4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 4, 4, 5, 4, 5, 3, 4]::int[], null, 'solo_post', null, '{}'::uuid[], 'e3c5e46e-58d5-4e50-a0b5-a94587cca9a7');
select public.league_post_card('bec2a77d-11e0-4305-87f5-6fa16007cae0', ARRAY[4, 5, 6, 4, 4, 6, 4, 3, 6, 4, 4, 4, 4, 5, 4, 6, 4, 5]::int[], null, 'solo_post', null, '{}'::uuid[], '747c8228-5a01-4deb-8093-b39352cfce91');
select public.league_post_card('386bd66d-d495-4c56-85af-c78d9ea96f46', ARRAY[5, 4, 6, 2, 5, 5, 5, 3, 5, 6, 5, 3, 4, 5, 5, 6, 3, 6]::int[], null, 'solo_post', null, '{}'::uuid[], '8a765967-304a-4387-8bae-8065dd24a2b0');
select public.league_finalize_week('e6d966e5-ab95-4adf-a964-6f3da885bbc5') r;
