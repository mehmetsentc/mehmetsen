"""NaHaber soft brand audio v2 — gentle intros, soft outro, three theme beds (own synthesis)."""
import sys
import numpy as np
from broadcast_audio import SR, T, hz, env, flt, add, saw, bell, kick, noise, save, rng

MOTIF = [74, 81, 77]  # D5 A5 F5  "Na-Ha-ber"


def epiano(m, sec=1.6, vel=1.0):
    t = T(sec)
    f = hz(m)
    trem = 1 + 0.08 * np.sin(2 * np.pi * 4.5 * t)
    x = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.4)
         + 0.12 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / 0.2))
    return x * env(len(t), 0.004, 0.9) * trem * vel


def guitar(m, sec=1.8, bright=1.0):
    t = T(sec)
    f = hz(m)
    x = np.zeros_like(t)
    for h in range(1, 12):
        x += np.sin(2 * np.pi * f * h * (1 + 0.0004 * h * h) * t) * np.exp(-t * (1.2 + 0.9 * h)) / h ** (1.1 / bright)
    return x * np.minimum(1, t / 0.002)


def soft_pad(notes, sec, cutoff=900, fade=0.6):
    x = sum(saw(hz(m), sec, 6, (-0.1, 0, 0.1)) for m in notes)
    x = flt(x, 'low', cutoff)
    t = T(sec)
    return x * np.minimum(1, np.minimum(t / fade, (sec - t) / fade)) / (len(notes) * 3)


def shaker():
    return noise(0.06, 5000, 12000, 0.008, 0.02)


def brush():
    return flt(noise(0.18, 1500, 7000, 0.004, 0.06), 'low', 5000)


def soft_kick(g=1.0):
    return kick(0.35, 95, 45, 0.16) * g


def intro_soft():
    out = np.zeros(int(1.6 * SR))
    add(out, soft_pad([50, 57, 64, 65, 69], 1.6, 1000, 0.5), 0, 0.9)
    for k, m in enumerate(MOTIF):
        add(out, bell(m, 1.2), 0.22 + 0.17 * k, 0.22)
        add(out, epiano(m - 12, 1.0, 0.5), 0.22 + 0.17 * k, 0.25)
    return out


def intro_slide():
    out = np.zeros(int(1.4 * SR))
    sw = flt(rng.standard_normal(int(0.5 * SR)), 'band', (600, 3000)) * np.sin(np.pi * np.arange(int(0.5 * SR)) / int(0.5 * SR)) ** 2
    add(out, sw, 0.0, 0.12)
    for k, m in enumerate(MOTIF):
        add(out, guitar(m - 12, 1.0, 1.2), 0.18 + 0.1 * k, 0.35)
    add(out, soft_pad([50, 57, 62, 65], 1.2, 1200, 0.3), 0.15, 0.6)
    return out


def intro_minimal():
    out = np.zeros(int(1.0 * SR))
    add(out, bell(81, 0.9), 0.0, 0.25)
    add(out, epiano(69, 0.8, 0.6), 0.0, 0.3)
    return out


def outro_soft():
    out = np.zeros(int(2.4 * SR))
    add(out, soft_pad([41, 53, 57, 60, 64], 2.4, 1100, 0.4), 0, 0.9)
    for k, m in enumerate(MOTIF):
        add(out, bell(m, 1.6), 0.15 + 0.22 * k, 0.24)
        add(out, epiano(m - 12, 1.4, 0.6), 0.15 + 0.22 * k, 0.25)
    add(out, epiano(65, 1.8, 0.5), 0.15 + 0.66, 0.2)
    return out


def bed_sakin(sec):
    bpm = 88; beat = 60 / bpm; bar = beat * 4
    chords = [[50, 57, 60, 64], [46, 53, 57, 62], [41, 53, 57, 60], [48, 55, 62, 64]]  # Dm9 Bbmaj7 Fmaj7 Cadd9
    out = np.zeros(int(sec * SR) + 2 * SR)
    t, k = 0.0, 0
    while t < sec:
        ch = chords[k % 4]
        add(out, soft_pad(ch, bar + 0.5, 800, 0.6), t, 0.8)
        for i, off in enumerate([0, 1.5, 2.5]):
            for j, m in enumerate(ch[1:]):
                add(out, epiano(m, 1.4, 0.5), t + off * beat + j * 0.012, 0.12 if i == 0 else 0.08)
        add(out, flt(saw(hz(ch[0] - 12), bar, 6), 'low', 300) * env(int(bar * SR), 0.02, bar * 0.7), t, 0.15)
        for b in (0, 2):
            add(out, soft_kick(), t + b * beat, 0.22)
        for s in range(8):
            add(out, shaker(), t + s * beat / 2, 0.035 if s % 2 else 0.05)
        t += bar; k += 1
    return out[: int(sec * SR)]


def bed_modern(sec):
    bpm = 108; beat = 60 / bpm; bar = beat * 4
    chords = [[45, 52, 57, 60], [41, 48, 53, 57], [48, 55, 60, 64], [43, 50, 55, 59]]  # Am F C G
    out = np.zeros(int(sec * SR) + 2 * SR)
    t, k = 0.0, 0
    while t < sec:
        ch = chords[k % 4]
        add(out, soft_pad(ch, bar + 0.4, 1300, 0.4), t, 0.7)
        seq = [ch[1], ch[2], ch[3], ch[2]] * 2
        for i in range(8):
            n = int(0.3 * SR)
            p = flt(saw(hz(seq[i] + 12), 0.3, 8), 'low', 2200) * env(n, 0.003, 0.09)
            add(out, p, t + i * beat / 2, 0.07)
        for b in range(4):
            add(out, soft_kick(), t + b * beat, 0.28)
            add(out, flt(saw(hz(ch[0] - 12), beat, 6), 'low', 260) * env(int(beat * SR), 0.01, beat * 0.5), t + b * beat, 0.16)
            add(out, noise(0.04, 8000, 15000, 0.0005, 0.012), t + b * beat + beat / 2, 0.06)
        add(out, brush(), t + beat, 0.06)
        add(out, brush(), t + 3 * beat, 0.06)
        t += bar; k += 1
    return out[: int(sec * SR)]


def bed_akustik(sec):
    bpm = 92; beat = 60 / bpm; bar = beat * 4
    chords = [[48, 52, 55, 60, 64], [43, 47, 50, 55, 59], [45, 52, 57, 60, 64], [41, 45, 53, 57, 60]]  # C G Am F
    pattern = [(0, 'd'), (1, 'd'), (1.5, 'u'), (2.5, 'u'), (3, 'd'), (3.5, 'u')]
    out = np.zeros(int(sec * SR) + 2 * SR)
    t, k = 0.0, 0
    while t < sec:
        ch = chords[k % 4]
        for off, dirn in pattern:
            notes = ch if dirn == 'd' else list(reversed(ch[1:]))
            for j, m in enumerate(notes):
                add(out, guitar(m, 1.4, 1.0 if dirn == 'd' else 1.4), t + off * beat + j * 0.014, 0.07 if dirn == 'd' else 0.045)
        add(out, guitar(ch[0] - 12, 1.8, 0.6), t, 0.12)
        for b in range(4):
            if b in (0, 2):
                add(out, soft_kick(), t + b * beat, 0.24)
            else:
                add(out, brush(), t + b * beat, 0.09)
        add(out, soft_pad(ch[1:4], bar + 0.4, 700, 0.6), t, 0.4)
        t += bar; k += 1
    return out[: int(sec * SR)]


if __name__ == '__main__':
    d = sys.argv[1]
    save(f'{d}/intro-soft.wav', intro_soft(), 0.8)
    save(f'{d}/intro-slide.wav', intro_slide(), 0.8)
    save(f'{d}/intro-minimal.wav', intro_minimal(), 0.7)
    save(f'{d}/outro-soft.wav', outro_soft(), 0.8)
    for name, fn in [('sakin', bed_sakin), ('modern', bed_modern), ('akustik', bed_akustik)]:
        x = fn(32.0)
        x *= np.minimum(1, (len(x) - np.arange(len(x))) / (0.8 * SR))
        save(f'{d}/bed-{name}.wav', x, 0.7)
    print('ok')
