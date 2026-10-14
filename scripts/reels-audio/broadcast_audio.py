"""NaHaber 'Broadcast' audio pack — original, synthesized in code (no samples).

Shared brand pieces: intro stinger (impact + stab + 3-note NaHaber motif), outro sonic logo.
Per-style beds (the Reels AI editor picks one): haber, magazin, spor, analiz.
"""
import sys
import numpy as np
from scipy.signal import butter, lfilter
from scipy.io import wavfile

SR = 44100
rng = np.random.default_rng(23)


def T(sec):
    return np.arange(int(sec * SR)) / SR


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env(n, a=0.005, d=0.3):
    t = np.arange(n) / SR
    return np.minimum(1.0, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / max(d, 1e-4))


def flt(x, kind, fc, order=2):
    w = np.array(fc) / (SR / 2)
    b, a = butter(order, w, kind)
    return lfilter(b, a, x)


def add(buf, clip, at, g=1.0):
    i = int(at * SR)
    if i >= len(buf) or i < 0:
        return
    j = min(len(buf), i + len(clip))
    buf[i:j] += clip[: j - i] * g


def saw(f, sec, harm=12, det=(0.0,)):
    t = T(sec)
    x = np.zeros_like(t)
    for d in det:
        ph = rng.uniform(0, 6.28)
        for h in range(1, harm + 1):
            x += np.sin(2 * np.pi * f * (1 + d / 100) * h * t + ph * h) / h
    return x / len(det)


def stab(notes, sec=0.6, bright=3500, d=0.25):
    x = sum(saw(hz(m), sec, 14, (-0.15, 0, 0.15)) for m in notes)
    x = flt(x, 'low', bright)
    return x * env(len(x), 0.004, d) / len(notes)


def pluck(m, sec=0.5, d=0.16, bright=1.0):
    t = T(sec)
    f = hz(m)
    x = np.sin(2 * np.pi * f * t) + 0.45 * bright * np.sin(4 * np.pi * f * t) + 0.2 * bright * np.sin(6 * np.pi * f * t)
    return x * env(len(t), 0.002, d)


def bell(m, sec=1.6):
    t = T(sec)
    f = hz(m)
    parts = [(1, 1.0, 1.1), (2.0, 0.45, 0.7), (2.76, 0.3, 0.45), (5.4, 0.15, 0.22), (8.9, 0.06, 0.12)]
    return sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in parts) * np.minimum(1, t / 0.002)


def kick(sec=0.45, f0=150, f1=42, d=0.22):
    t = T(sec)
    f = f1 + (f0 - f1) * np.exp(-t / 0.035)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.001, d)


def noise(sec, lo, hi, a=0.001, d=0.05):
    n = int(sec * SR)
    return flt(rng.standard_normal(n), 'band', (lo, min(hi, SR / 2 - 200))) * env(n, a, d)


def hat(open_=False):
    return noise(0.25 if open_ else 0.05, 7000, 16000, 0.0005, 0.08 if open_ else 0.014)


def clap():
    out = np.zeros(int(0.3 * SR))
    for k in range(3):
        add(out, noise(0.02, 900, 5000, 0.0005, 0.006), k * 0.011, 0.6)
    add(out, noise(0.25, 900, 4000, 0.001, 0.07), 0.03, 0.8)
    return out


def riser(sec=0.6):
    n = int(sec * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 512
    for i in range(0, n, blk):
        c = 500 + 7000 * (i / n) ** 1.6
        seg = flt(x[max(0, i - 2048): i + blk], 'band', (c * 0.7, min(c * 1.5, SR / 2 - 200)))[-min(blk, n - i):]
        out[i: i + len(seg)] = seg
    return out * np.linspace(0, 1, n) ** 2


def whoosh(sec=0.45, up=True):
    n = int(sec * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 512
    for i in range(0, n, blk):
        k = i / n if up else 1 - i / n
        c = 350 + 5500 * k
        seg = flt(x[max(0, i - 2048): i + blk], 'band', (c * 0.6, min(c * 1.7, SR / 2 - 200)))[-min(blk, n - i):]
        out[i: i + len(seg)] = seg
    return out * np.sin(np.pi * np.arange(n) / n) ** 1.4


def impact():
    out = np.zeros(int(1.6 * SR))
    add(out, kick(1.2, 120, 34, 0.5), 0, 1.0)
    add(out, flt(rng.standard_normal(int(1.4 * SR)), 'high', 1500) * env(int(1.4 * SR), 0.001, 0.45), 0, 0.22)
    return out


MOTIF = [74, 81, 77]  # D5 A5 F5 — "Na-Ha-ber"


def intro():
    out = np.zeros(int(1.6 * SR))
    add(out, riser(0.32), 0.0, 0.25)
    add(out, impact(), 0.30, 0.9)
    add(out, stab([50, 57, 62, 65, 69], 0.9, 4200, 0.32), 0.30, 0.75)  # Dm stab
    for k, m in enumerate(MOTIF):
        add(out, pluck(m, 0.6, 0.18), 0.42 + 0.11 * k, 0.32)
        add(out, bell(m + 12, 0.9), 0.42 + 0.11 * k, 0.07)
    return out


def outro():
    out = np.zeros(int(2.2 * SR))
    add(out, whoosh(0.35, True), 0.0, 0.18)
    add(out, impact(), 0.3, 0.7)
    for k, m in enumerate(MOTIF):
        add(out, bell(m, 1.6), 0.32 + 0.16 * k, 0.32)
        add(out, pluck(m - 12, 0.8, 0.3, 0.6), 0.32 + 0.16 * k, 0.25)
    add(out, stab([50, 57, 62, 65, 74], 1.6, 3000, 0.8), 0.32 + 0.32, 0.45)
    return out


def pad(notes, sec, cutoff=1200):
    x = sum(saw(hz(m), sec, 8, (-0.12, 0, 0.11)) for m in notes)
    x = flt(x, 'low', cutoff)
    t = T(sec)
    return x * np.minimum(1, np.minimum(t / 0.3, (sec - t) / 0.3)) / (len(notes) * 3)


def bed(style, sec):
    cfg = {
        # bpm, chord roots (minor/major sets), arp, drums
        'haber':   dict(bpm=120, chords=[[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 48, 52]], arp=True, kick='4', clap=False, pad_cut=1100, arp_oct=24),
        'magazin': dict(bpm=112, chords=[[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]], arp=True, kick='4', clap=True, pad_cut=2000, arp_oct=24),
        'spor':    dict(bpm=128, chords=[[45, 48, 52], [41, 45, 48], [43, 47, 50], [40, 43, 47]], arp=True, kick='4x', clap=True, pad_cut=1600, arp_oct=24),
        'analiz':  dict(bpm=84,  chords=[[50, 53, 57, 60], [46, 50, 53, 57], [43, 46, 50, 53], [45, 49, 52, 55]], arp=False, kick='half', clap=False, pad_cut=900, arp_oct=24),
    }[style]
    beat = 60 / cfg['bpm']
    bar = beat * 4
    out = np.zeros(int(sec * SR) + SR)
    t, k = 0.0, 0
    while t < sec:
        ch = cfg['chords'][k % 4]
        add(out, pad(ch, bar + 0.35, cfg['pad_cut']), t, 0.9)
        add(out, saw(hz(ch[0] - 12), bar, 6) * 0, t)  # placeholder (keeps phase rng stable)
        # bass: root on 8ths (haber/spor), on beats (magazin), whole notes (analiz)
        step = beat / 2 if style in ('haber', 'spor') else (beat if style == 'magazin' else bar)
        s = 0.0
        while s < bar - 1e-6:
            n = int(min(step, 0.5) * SR)
            b = flt(saw(hz(ch[0] - 12), n / SR, 10), 'low', 500) * env(n, 0.003, step * 0.6)
            add(out, b, t + s, 0.22 if style != 'analiz' else 0.16)
            s += step
        if cfg['arp']:
            seq = (ch + [ch[0] + 12]) * 4
            for i in range(16):
                add(out, pluck(seq[i] + cfg['arp_oct'] - 12, 0.25, 0.09, 0.8), t + i * beat / 4, 0.06 if i % 4 else 0.09)
        else:
            for i, m in enumerate([ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[2] + 24]):
                add(out, pluck(m, 1.2, 0.5, 0.4), t + i * beat, 0.08)
        # drums
        for b_ in range(4):
            if cfg['kick'] in ('4', '4x') or (cfg['kick'] == 'half' and b_ in (0, 2)):
                add(out, kick(0.4), t + b_ * beat, 0.42 if style != 'analiz' else 0.25)
            if cfg['kick'] == '4x' and b_ == 3:
                add(out, kick(0.3), t + b_ * beat + beat / 2, 0.3)
            if cfg['clap'] and b_ in (1, 3):
                add(out, clap(), t + b_ * beat, 0.22)
            for h in range(2 if style != 'spor' else 4):
                add(out, hat(open_=(h == 1 and style == 'magazin')), t + b_ * beat + h * beat / (2 if style != 'spor' else 4), 0.07 if h else 0.1)
        t += bar
        k += 1
    out = out[: int(sec * SR)]
    out *= np.minimum(1, (len(out) - np.arange(len(out))) / (0.8 * SR))
    return out


def click():
    c = noise(0.035, 1800, 7000, 0.0005, 0.006) * 0.9
    return c + np.sin(2 * np.pi * 180 * T(0.035)) * env(int(0.035 * SR), 0.0005, 0.008) * 0.4


def save(path, x, peak=0.89):
    m = np.max(np.abs(x)) or 1
    wavfile.write(path, SR, (x / m * peak * 32767).astype(np.int16))


if __name__ == '__main__':
    d = sys.argv[1]
    save(f'{d}/intro.wav', intro())
    save(f'{d}/outro.wav', outro())
    save(f'{d}/click.wav', click(), 0.8)
    save(f'{d}/whoosh-up.wav', whoosh(0.45, True), 0.8)
    save(f'{d}/whoosh-down.wav', whoosh(0.5, False), 0.8)
    for s in ('haber', 'magazin', 'spor', 'analiz'):
        save(f'{d}/bed-{s}.wav', bed(s, 24.0), 0.7)
    print('ok')
