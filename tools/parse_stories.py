import os,re,json,subprocess,sys,openpyxl
root=sys.argv[1]; out=sys.argv[2]
CJK=r'[⺀-鿿　-〿＀-￯“”‘’"—…·、]'
def norm(s):
    s=re.sub(r'\s+',' ',s).strip()
    # remove spaces between CJK/punct chars
    prev=None
    while prev!=s:
        prev=s; s=re.sub(rf'({CJK}) +({CJK})',r'\1\2',s)
    s=re.sub(r' *（ *([^）]*?) *）',r'（\1）',s)
    s=re.sub(rf'({CJK}) +([A-Za-z])',r'\1 \2',s)
    return s
TOK=re.compile(r"([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]*(?: [A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]*)*)（([^）]+)）")
stories=[];issues=[]
dirs=sorted([d for d in os.listdir(root) if os.path.isdir(os.path.join(root,d))],key=lambda d:int(d.split('、')[0]))
for d in dirs:
    num,title=d.split('、',1)
    txt=subprocess.run(['pdftotext','-layout',os.path.join(root,d,f'{d}_學習版.pdf'),'-'],capture_output=True,text=True).stdout
    txt=txt.replace('\f','\n\n\n')
    lines=txt.split('\n')
    # paragraphs: separated by >=2 consecutive blank lines
    paras=[];cur=[];blank=0
    for ln in lines:
        if re.match(r'^\s*(Step\d|Story\d+)',ln) or '學習版' in ln: continue
        if ln.strip()=='' : blank+=1; continue
        if blank>=2 and cur: paras.append(' '.join(cur)); cur=[]
        blank=0; cur.append(ln)
    if cur: paras.append(' '.join(cur))
    paras=[norm(p) for p in paras]
    paras=[p for p in paras if not p.startswith('Step1') and not re.match(r'^Story\d+',p) and '學習版' not in p]
    wb=openpyxl.load_workbook(os.path.join(root,d,'重點單詞.xlsx'),read_only=True)
    words=[[str(r[1]).strip(),str(r[2]).strip()] for r in list(wb.worksheets[0].iter_rows(values_only=True))[1:] if r[1]]
    wl={w.lower() for w,_ in words}
    segs=[]
    for p in paras:
        parts=[];pos=0
        for m in TOK.finditer(p):
            ws=m.group(1).split(' '); k=len(ws)-1
            for i in range(len(ws)):
                if ' '.join(ws[i:]).lower() in wl: k=i; break
            pre=' '.join(ws[:k]); start=m.start()+(len(pre)+1 if pre else 0)
            if start>pos: parts.append(p[pos:start])
            parts.append([' '.join(ws[k:]),m.group(2).strip()]); pos=m.end()
        if pos<len(p): parts.append(p[pos:])
        segs.append(parts)
    nt=sum(1 for s in segs for x in s if isinstance(x,list))
    if nt!=len(words): issues.append((num,nt,len(words)))
    stories.append({'id':int(num),'title':title,'paras':segs,'words':words})
json.dump(stories,open(out,'w'),ensure_ascii=False,separators=(',',':'))
print('issues',issues)
