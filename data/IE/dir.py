import re, json, time, urllib.request
NI = ['8748-county-antrim','8749-county-armagh','8750-county-down','8751-county-fermanagh','8752-county-londonderry','8753-county-tyrone']
ROI = ['8808-county-carlow','8809-county-cavan','8810-county-clare','8811-county-cork','8812-county-donegal','8813-county-dublin','8814-county-galway','8815-county-kerry','8816-county-kildare','8817-county-kilkenny','8818-county-laois','8819-county-leitrim','8820-county-limerick','8821-county-longford','8822-county-louth','8823-county-mayo','8824-county-meath','8825-county-monaghan','8826-county-offaly','8827-county-roscommon','8828-county-sligo','8829-county-tipperary','8830-county-waterford','8831-county-westmeath','8832-county-wexford','8833-county-wicklow']
out = {}
for region, lst in (('NI', NI), ('IE', ROI)):
    for c in lst:
        url = 'https://www.golfpass.com/travel-advisor/course-directory/%s/' % c
        for att in range(3):
            try:
                html = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read().decode('utf-8', 'replace'); break
            except Exception as e:
                time.sleep(3); html = ''
        ids = sorted(set(re.findall(r'travel-advisor/courses/(\d+)-([a-z0-9-]+)', html)))
        county = c.split('-', 1)[1].replace('county-', '').title()
        for gid, slug in ids:
            out[gid] = {'gp': int(gid), 'slug': slug, 'region': region, 'county': county}
        print(region, county, len(ids), flush=True)
        time.sleep(0.6)
json.dump(out, open('directory.json', 'w'), indent=1)
print('total', len(out))
