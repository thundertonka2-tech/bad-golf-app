select set_config('request.jwt.claims', json_build_object('sub','659d5edc-f938-4900-9793-42aa4730667d','role','authenticated')::text, true);
select public.league_post_card('c96165ae-380b-47f0-92bf-20104929653b', ARRAY[4, 4, 5, 3, 4, 5, 4, 3, 4, 4, 3, 3, 4, 5, 4, 5, 3, 5]::int[], null, 'solo_post', null, '{}'::uuid[], 'dac3c761-7c1e-4f59-b57a-df38abb21d3f');
select public.league_post_card('102383f5-7d97-4793-9db0-79c98f81f60e', ARRAY[4, 4, 5, 3, 4, 5, 4, 3, 5, 4, 3, 3, 4, 5, 4, 6, 3, 5]::int[], null, 'solo_post', null, '{}'::uuid[], 'fcfe640d-bbe5-49b5-84d0-c8fe24820d5a');
select public.league_post_card('c96165ae-380b-47f0-92bf-20104929653b', ARRAY[6, 4, 6, 3, 5, 5, 5, 4, 5, 5, 5, 3, 5, 5, 5, 6, 3, 5]::int[], null, 'solo_post', null, '{}'::uuid[], '8a765967-304a-4387-8bae-8065dd24a2b0');
select public.league_post_card('102383f5-7d97-4793-9db0-79c98f81f60e', ARRAY[4, 4, 5, 3, 4, 5, 4, 3, 5, 4, 4, 3, 4, 5, 4, 5, 3, 4]::int[], null, 'solo_post', null, '{}'::uuid[], 'e3c5e46e-58d5-4e50-a0b5-a94587cca9a7');
select public.league_post_card('480b4a3c-99f4-4dec-b67f-09bdc3536e61', ARRAY[3, 5, 6, 4, 4, 5, 5, 3, 5, 4, 4, 3, 4, 6, 5, 6, 4, 5]::int[], null, 'solo_post', null, '{}'::uuid[], 'b05ea29f-b0f4-4d59-a627-48bf8dbdbb98');
select public.league_declare_absence('480b4a3c-99f4-4dec-b67f-09bdc3536e61', '747c8228-5a01-4deb-8093-b39352cfce91', 'QA v2002 test: absent');
