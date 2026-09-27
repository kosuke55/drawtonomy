#!/usr/bin/env python3
"""Cross-check runner verdicts against verdicts recomputed from the CSV logs (esmini csv_logger)
with the same OBB geometry drawtonomy uses for FAIL CONDITIONS. Expect 0 mismatches.

  python3 tools/verify_verdicts.py [1.0 1.1 ...]   # default: every results/aeb@*

Conditions come from the xosc parameter drawtonomy:failConditions: Collision (OBB overlap, SAT) and
LongitudinalDistanceToActor (gap along the ego heading <= value).
Reads the committed (slim) logs: 0.04 s rows, the columns drawtonomy reads, mm / 1e-4 rad (tools/slim_logs.py).
"""
import json, math, sys, glob, os, re
import yaml
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FC={}
for tcy in glob.glob(f'{R}/testcases/**/testcase.yaml', recursive=True):
    t=yaml.safe_load(open(tcy)); x=open(os.path.join(os.path.dirname(tcy),t['scenario'])).read()
    m=re.search(r"drawtonomy:failConditions\" parameterType=\"string\" value='([^']*)'",x)
    FC[t['id']]=json.loads(m.group(1))
def corners(e):
    ch,sh=math.cos(e['h']),math.sin(e['h']); cx=e['x']+e['bx']*ch; cy=e['y']+e['bx']*sh
    hl,hw=e['l']/2,e['w']/2
    return [(cx+lx*ch-ly*sh,cy+lx*sh+ly*ch) for lx,ly in ((hl,hw),(hl,-hw),(-hl,-hw),(-hl,hw))]
def proj(c,ax,ay):
    d=[x*ax+y*ay for x,y in c]; return min(d),max(d)
def overlap(a,b):
    ca,cb=corners(a),corners(b)
    for r in (ca,cb):
        for i in range(4):
            (x1,y1),(x2,y2)=r[i],r[(i+1)%4]; nx,ny=-(y2-y1),x2-x1; n=math.hypot(nx,ny); nx/=n; ny/=n
            a0,a1=proj(ca,nx,ny); b0,b1=proj(cb,nx,ny)
            if a1<b0 or b1<a0: return False
    return True
def longfree(actor,ref):
    ax,ay=math.cos(ref['h']),math.sin(ref['h']); cr,ca=corners(ref),corners(actor)
    r0,r1=proj(cr,ax,ay); a0,a1=proj(ca,ax,ay)
    crx=ref['x']+ref['bx']*ax; cry=ref['y']+ref['bx']*ay
    cax=actor['x']+actor['bx']*math.cos(actor['h']); cay=actor['y']+actor['bx']*math.sin(actor['h'])
    ahead=cax*ax+cay*ay>=crx*ax+cry*ay
    return (a0-r1) if ahead else (r0-a1), ahead
def frames(path):
    lines=open(path).read().splitlines()
    hi=next(i for i,l in enumerate(lines) if 'TimeStamp' in l)
    hdr=[h.strip() for h in lines[hi].split(',')]
    per=hdr.index('#2 Entity_Name [-]')-hdr.index('#1 Entity_Name [-]') if '#2 Entity_Name [-]' in hdr else None
    base=hdr.index('#1 Entity_Name [-]')
    names=[h for h in hdr[base:base+per]]
    idx={k:names.index(next(n for n in names if n.startswith('#1 '+k))) for k in ['Entity_Name','bb_x','bb_length','bb_width','World_Position_X','World_Position_Y','World_Heading_Angle']}
    for l in lines[hi+1:]:
        c=[v.strip() for v in l.split(',')]
        if len(c)<base+per: continue
        ents={}
        k=0
        while base+per*(k+1)<=len(c) and c[base+per*k+idx['Entity_Name']]:
            b=base+per*k
            g=lambda key: float(c[b+idx[key]])
            ents[c[b+idx['Entity_Name']]]={'x':g('World_Position_X'),'y':g('World_Position_Y'),'h':g('World_Heading_Angle'),'bx':g('bb_x'),'l':g('bb_length'),'w':g('bb_width')}
            k+=1
        yield ents
tot=0;mis=[]
vers=sys.argv[1:] or sorted(p.split('@',1)[1] for p in (os.path.basename(d) for d in glob.glob(f'{R}/results/aeb@*')))
for v in vers:
    for f in sorted(glob.glob(f'{R}/results/aeb@{v}/TC-*.json')):
        d=json.load(open(f)); tc=d['testcase']; conds=FC[tc]
        for r in d['runs']:
            log=r.get('log'); log=log.get('path') if isinstance(log,dict) else log   # {"path",...} or the old string
            if not log: continue
            fail=False
            for ents in frames(os.path.join(os.path.dirname(f),log)):
                for c in conds:
                    if c['type']=='Collision':
                        a,b=ents.get(c['actorRef']),ents.get(c['otherRef'])
                        if a and b and overlap(a,b): fail=True
                    elif c['type']=='LongitudinalDistanceToActor':
                        a,ref=ents.get(c['actorRef']),ents.get(c['referenceRef'])
                        if a and ref:
                            fs,ahead=longfree(a,ref)
                            if (c['relativePosition']!='ahead' or ahead) and fs<=c['distanceM']: fail=True
                if fail: break
            tot+=1
            app='FAIL' if fail else 'PASS'
            if app!=r['verdict']: mis.append((v,tc,r['id'],r['params'],r['verdict'],app,r['kpis'].get('min_gap')))
print('checked',tot,'mismatch',len(mis))
for m in mis[:30]: print(m)
