import sys, numpy as np
from broadcast_audio import SR, T, hz, env, flt, add, saw, bell, kick, noise, save, rng
from soft_audio import epiano, guitar, soft_pad, shaker, brush, soft_kick, MOTIF

def timp(m, g=1.0):
    t=T(1.2); f=hz(m); x=np.sin(2*np.pi*f*t)*np.exp(-t/0.45)+0.4*np.sin(2*np.pi*f*1.5*t)*np.exp(-t/0.25)
    return flt(x,'low',800)*np.minimum(1,t/0.004)*g

def bed_kurumsal(sec):
    bpm=100; beat=60/bpm; bar=beat*4
    ch=[[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59]]  # C Am F G
    out=np.zeros(int(sec*SR)+2*SR); t=0; k=0
    while t<sec:
        c=ch[k%4]
        add(out,soft_pad(c,bar+0.5,1500,0.5),t,0.8)
        for i in range(8):
            m=[c[1],c[2],c[3],c[2]][i%4]+12
            add(out,epiano(m,0.8,0.6),t+i*beat/2,0.07)
        add(out,timp(c[0]-12),t,0.25); add(out,timp(c[0]-12),t+2*beat,0.15)
        for b in range(4): add(out,noise(0.04,7000,14000,0.0005,0.012),t+b*beat+beat/2,0.05)
        t+=bar; k+=1
    return out[:int(sec*SR)]

def bed_lofi(sec):
    bpm=76; beat=60/bpm; bar=beat*4
    ch=[[50,57,60,65],[43,53,57,62],[48,55,59,64],[45,52,55,60]]  # Dm9 G7 Cmaj7 Am7
    out=np.zeros(int(sec*SR)+2*SR); t=0; k=0
    while t<sec:
        c=ch[k%4]
        for j,m in enumerate(c[1:]): add(out,epiano(m,2.0,0.6),t+j*0.02,0.09)
        add(out,epiano(c[0]-12,2.0,0.7),t,0.12)
        for j,m in enumerate(c[1:]): add(out,epiano(m,1.4,0.4),t+2.5*beat+j*0.02,0.06)
        for b in range(4):
            if b in (0,2): add(out,soft_kick(),t+b*beat+(0.04 if b==2 else 0),0.3)
            else: add(out,flt(noise(0.2,800,4000,0.002,0.08),'low',3000),t+b*beat,0.12)
            add(out,shaker(),t+b*beat+beat/2,0.04)
        t+=bar; k+=1
    x=out[:int(sec*SR)]
    return flt(x,'low',5500)

def intro_perde():
    out=np.zeros(int(1.5*SR))
    n=int(0.7*SR); sw=flt(rng.standard_normal(n),'band',(300,2200))*np.sin(np.pi*np.arange(n)/n)**2
    add(out,sw,0,0.10)
    add(out,soft_pad([50,57,62,65,69],1.4,1100,0.4),0.05,0.8)
    for k,m in enumerate(MOTIF): add(out,bell(m,1.1),0.45+0.15*k,0.2)
    return out

def intro_zoom():
    out=np.zeros(int(1.5*SR))
    n=int(0.6*SR); r=flt(rng.standard_normal(n),'band',(800,5000))*np.linspace(0,1,n)**2
    add(out,r,0,0.08)
    add(out,soft_kick(1.0),0.6,0.5)
    for k,m in enumerate(MOTIF): add(out,epiano(m,1.0,0.7),0.6+0.12*k,0.3); add(out,bell(m+12,0.8),0.6+0.12*k,0.06)
    return out

def outro_follow():
    out=np.zeros(int(2.4*SR))
    add(out,soft_pad([41,53,57,60,64],2.4,1200,0.4),0,0.8)
    for k,m in enumerate(MOTIF): add(out,bell(m,1.5),0.15+0.2*k,0.22)
    add(out,epiano(77,1.2,0.6),1.0,0.2); add(out,epiano(81,1.2,0.6),1.15,0.2)
    return out

def outro_short():
    out=np.zeros(int(1.4*SR))
    add(out,bell(74,1.3),0.0,0.3); add(out,epiano(62,1.2,0.6),0.0,0.3)
    return out

if __name__=='__main__':
    d=sys.argv[1]
    for name,fn in [('kurumsal',bed_kurumsal),('lofi',bed_lofi)]:
        x=fn(32.0); x*=np.minimum(1,(len(x)-np.arange(len(x)))/(0.8*SR)); save(f'{d}/bed-{name}.wav',x,0.7)
    save(f'{d}/intro-perde.wav',intro_perde(),0.8)
    save(f'{d}/intro-zoom.wav',intro_zoom(),0.8)
    save(f'{d}/outro-follow.wav',outro_follow(),0.8)
    save(f'{d}/outro-short.wav',outro_short(),0.75)
    print('ok')
