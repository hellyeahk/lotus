/**
         * ============================================================================
         * SACRED LOTUS (NELUMBO NUCIFERA) — 3D MOONLIT POND SIMULATION
         * 60 FPS Offscreen-Cached Canvas + C1-Continuous Splines + Zero UI
         * ============================================================================
         */

        const canvas = document.getElementById('lotusCanvas');
        const ctx = canvas.getContext('2d', { alpha: false });

        // Offscreen cached background & glow sprites for locked 60 FPS performance
        const bgCanvas = document.createElement('canvas');
        const bgCtx = bgCanvas.getContext('2d', { alpha: false });
        const sprites = {};

        let width = window.innerWidth;
        let height = window.innerHeight;
        let dpr = Math.min(window.devicePixelRatio || 1, 1);
        let horizonY = height * 0.54;

        let lotusPlants = [];
        let floatingPads = [];
        let ripples = [];
        let fireflies = [];

        let globalTime = 0;
        let lastTimestamp = 0;
        let pointerX = width * 0.5;
        let windVelocity = 0;
        let windTarget = 0;
        let autoRippleTimer = 0;

        // ============================================================================
        // MATH, EASING & SMOOTH SPLINE UTILITIES
        // ============================================================================
        function randomRange(min, max) {
            return Math.random() * (max - min) + min;
        }

        function clamp(val, min, max) {
            return Math.min(Math.max(val, min), max);
        }

        function lerp(a, b, t) {
            return a + (b - a) * t;
        }

        function easeOutCubic(t) {
            return 1 - Math.pow(1 - t, 3);
        }

        function easeInOutCubic(t) {
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        function evalQuadBezier(p0, p1, p2, t) {
            const mt = 1 - t;
            return {
                x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
                y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
            };
        }

        /**
         * C1-Continuous Quadratic Midpoint Spline for silky-smooth organic curves
         */
        function traceSmoothSpline(context, points, moveFirst = true) {
            const len = points.length;
            if (len === 0) return;
            if (moveFirst) {
                context.moveTo(points[0].x, points[0].y);
            } else {
                context.lineTo(points[0].x, points[0].y);
            }
            if (len === 1) return;
            if (len === 2) {
                context.lineTo(points[1].x, points[1].y);
                return;
            }
            for (let i = 1; i < len - 1; i++) {
                const xc = (points[i].x + points[i + 1].x) * 0.5;
                const yc = (points[i].y + points[i + 1].y) * 0.5;
                context.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
            }
            context.lineTo(points[len - 1].x, points[len - 1].y);
        }

        /**
         * 3D Euler Rotation + Perspective Projection
         */
        function project3D(lx, ly, lz, originX, originY, yaw, pitch, roll, focalLength = 720) {
            const cosR = Math.cos(roll);
            const sinR = Math.sin(roll);
            const x1 = lx * cosR - ly * sinR;
            const y1 = lx * sinR + ly * cosR;
            const z1 = lz;

            const cosP = Math.cos(pitch);
            const sinP = Math.sin(pitch);
            const x2 = x1;
            const y2 = y1 * cosP - z1 * sinP;
            const z2 = y1 * sinP + z1 * cosP;

            const cosY = Math.cos(yaw);
            const sinY = Math.sin(yaw);
            const x3 = x2 * cosY + z2 * sinY;
            const y3 = y2;
            const z3 = -x2 * sinY + z2 * cosY;

            const persp = focalLength / Math.max(focalLength - z3 * 0.62, 200);
            return {
                x: originX + x3 * persp,
                y: originY + y3 * persp,
                z: z3,
                scale: persp
            };
        }

        // ============================================================================
        // OFFSCREEN GLOW SPRITES & MOONLIT POND BACKGROUND CACHE
        // ============================================================================
        function createRadialSprite(size, stops) {
            const off = document.createElement('canvas');
            off.width = size;
            off.height = size;
            const octx = off.getContext('2d');
            const half = size * 0.5;
            const grad = octx.createRadialGradient(half, half, 0, half, half, half);
            stops.forEach(([offset, color]) => grad.addColorStop(offset, color));
            octx.fillStyle = grad;
            octx.fillRect(0, 0, size, size);
            return off;
        }

        function initGlowSprites() {
            sprites.roseAura = createRadialSprite(256, [
                [0.0, 'rgba(244, 114, 182, 0.36)'],
                [0.4, 'rgba(219, 39, 119, 0.16)'],
                [0.75, 'rgba(131, 24, 67, 0.05)'],
                [1.0, 'rgba(0, 0, 0, 0)']
            ]);

            sprites.goldCore = createRadialSprite(160, [
                [0.0, 'rgba(254, 249, 195, 0.72)'],
                [0.35, 'rgba(251, 191, 36, 0.34)'],
                [0.75, 'rgba(217, 119, 6, 0.08)'],
                [1.0, 'rgba(0, 0, 0, 0)']
            ]);

            sprites.firefly = createRadialSprite(64, [
                [0.0, 'rgba(254, 252, 232, 0.95)'],
                [0.25, 'rgba(253, 224, 71, 0.55)'],
                [0.65, 'rgba(245, 158, 11, 0.14)'],
                [1.0, 'rgba(0, 0, 0, 0)']
            ]);

            sprites.dew = createRadialSprite(48, [
                [0.0, 'rgba(255, 255, 255, 0.92)'],
                [0.35, 'rgba(186, 230, 253, 0.45)'],
                [0.8, 'rgba(56, 189, 248, 0.12)'],
                [1.0, 'rgba(0, 0, 0, 0)']
            ]);
        }

        function rebuildBackgroundCache() {
            bgCanvas.width = Math.floor(width * dpr);
            bgCanvas.height = Math.floor(height * dpr);
            bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

            horizonY = height * 0.54;

            // 1. Twilight Sky (above horizon)
            const skyGrad = bgCtx.createLinearGradient(0, 0, 0, horizonY);
            skyGrad.addColorStop(0, '#070b1a');
            skyGrad.addColorStop(0.55, '#111936');
            skyGrad.addColorStop(1, '#1d274d');
            bgCtx.fillStyle = skyGrad;
            bgCtx.fillRect(0, 0, width, horizonY + 2);

            // Soft full moon & atmospheric halo
            const moonX = width * 0.74;
            const moonY = horizonY * 0.38;
            const moonR = Math.min(width, height) * 0.055;

            const moonHalo = bgCtx.createRadialGradient(moonX, moonY, moonR * 0.4, moonX, moonY, moonR * 6.5);
            moonHalo.addColorStop(0, 'rgba(254, 249, 195, 0.34)');
            moonHalo.addColorStop(0.35, 'rgba(199, 210, 254, 0.12)');
            moonHalo.addColorStop(1, 'rgba(17, 25, 54, 0)');
            bgCtx.fillStyle = moonHalo;
            bgCtx.beginPath();
            bgCtx.arc(moonX, moonY, moonR * 6.5, 0, Math.PI * 2);
            bgCtx.fill();

            const moonDisk = bgCtx.createRadialGradient(
                moonX - moonR * 0.2, moonY - moonR * 0.2, moonR * 0.1,
                moonX, moonY, moonR
            );
            moonDisk.addColorStop(0, '#fffbeb');
            moonDisk.addColorStop(0.85, '#fef3c7');
            moonDisk.addColorStop(1, 'rgba(253, 230, 138, 0.85)');
            bgCtx.fillStyle = moonDisk;
            bgCtx.beginPath();
            bgCtx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
            bgCtx.fill();

            // Distant misty lotus silhouettes along horizon
            bgCtx.fillStyle = 'rgba(10, 18, 36, 0.75)';
            bgCtx.beginPath();
            bgCtx.moveTo(0, horizonY);
            for (let x = 0; x <= width + 40; x += 40) {
                const hillH = 14 + Math.sin(x * 0.008) * 10 + Math.cos(x * 0.021) * 6;
                bgCtx.lineTo(x, horizonY - hillH);
            }
            bgCtx.lineTo(width, horizonY + 4);
            bgCtx.lineTo(0, horizonY + 4);
            bgCtx.closePath();
            bgCtx.fill();

            // 2. Moonlit Pond Surface (below horizon)
            const pondGrad = bgCtx.createLinearGradient(0, horizonY, 0, height);
            pondGrad.addColorStop(0, '#162447');
            pondGrad.addColorStop(0.28, '#0e1d36');
            pondGrad.addColorStop(0.68, '#081324');
            pondGrad.addColorStop(1, '#040914');
            bgCtx.fillStyle = pondGrad;
            bgCtx.fillRect(0, horizonY, width, height - horizonY);

            // Moon reflection shimmer column on water
            bgCtx.save();
            bgCtx.globalCompositeOperation = 'screen';
            const reflCount = 26;
            for (let i = 0; i < reflCount; i++) {
                const t = i / reflCount;
                const ry = lerp(horizonY + 8, height * 0.94, Math.pow(t, 1.15));
                const rw = lerp(moonR * 0.7, moonR * 3.4, t) * (0.65 + 0.35 * Math.sin(i * 2.3));
                const rh = lerp(1.5, 4.5, t);
                const rx = moonX + Math.sin(i * 1.9) * (12 + t * 26);

                bgCtx.fillStyle = `rgba(254, 243, 199, ${lerp(0.18, 0.03, t)})`;
                bgCtx.beginPath();
                bgCtx.ellipse(rx, ry, rw, rh, 0, 0, Math.PI * 2);
                bgCtx.fill();
            }

            // Soft twilight bokeh circles
            const bokehColors = [
                'rgba(244, 114, 182, 0.09)',
                'rgba(129, 140, 248, 0.09)',
                'rgba(45, 212, 191, 0.07)'
            ];
            for (let i = 0; i < 18; i++) {
                const bx = ((i * 197) % 100) / 100 * width;
                const by = ((i * 131) % 100) / 100 * height;
                const br = 36 + (i % 5) * 22;
                const g = bgCtx.createRadialGradient(bx, by, 0, bx, by, br);
                g.addColorStop(0, bokehColors[i % bokehColors.length]);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                bgCtx.fillStyle = g;
                bgCtx.beginPath();
                bgCtx.arc(bx, by, br, 0, Math.PI * 2);
                bgCtx.fill();
            }
            bgCtx.restore();
        }

        // ============================================================================
        // PELTATE LOTUS LEAF (WHOLE ROUND SHIELD PAD WITH UMBILICUS & DEW DROP)
        // ============================================================================
        class PeltateLotusLeaf {
            constructor(options = {}) {
                this.x = options.x;
                this.y = options.y;
                this.rx = options.rx || 78;
                this.ry = options.ry || this.rx * 0.36; // 2.5D perspective foreshortening
                this.rotation = options.rotation || randomRange(-0.2, 0.2);
                this.isAerial = options.isAerial || false;
                this.stemBaseX = options.stemBaseX || this.x;
                this.stemBaseY = options.stemBaseY || this.y + 90;
                this.delay = options.delay || 0;
                this.phase = randomRange(0, Math.PI * 2);
                this.hasDew = options.hasDew !== undefined ? options.hasDew : Math.random() > 0.35;
                this.dewAngle = randomRange(0.4, 2.7);
                this.dewDist = randomRange(0.32, 0.62);
            }

            draw(context, age, windSway) {
                const localAge = age - this.delay;
                if (localAge <= 0) return;

                const grow = easeOutCubic(clamp(localAge / 2.2, 0, 1));
                const bobX = Math.sin(globalTime * 1.1 + this.phase) * (this.isAerial ? 6 : 2.5) + windSway * (this.isAerial ? 0.55 : 0.14);
                const bobY = Math.cos(globalTime * 0.9 + this.phase) * (this.isAerial ? 2.5 : 1.2);

                const cx = this.x + bobX;
                const cy = this.y + bobY;
                const curRx = this.rx * lerp(0.18, 1.0, grow);
                const curRy = this.ry * lerp(0.18, 1.0, grow);

                // If aerial leaf, draw graceful curved stem rising from the pond
                if (this.isAerial) {
                    const p0 = { x: this.stemBaseX, y: this.stemBaseY };
                    const p2 = { x: cx, y: cy + curRy * 0.15 };
                    const p1 = {
                        x: lerp(p0.x, p2.x, 0.45) + bobX * 0.4,
                        y: lerp(p0.y, p2.y, 0.55)
                    };

                    // Water reflection under stem base
                    context.save();
                    context.beginPath();
                    context.ellipse(p0.x, p0.y, curRx * 0.28, curRy * 0.28, 0, 0, Math.PI * 2);
                    context.strokeStyle = 'rgba(148, 197, 255, 0.16)';
                    context.lineWidth = 1.2;
                    context.stroke();

                    // Stem
                    context.beginPath();
                    context.moveTo(p0.x, p0.y);
                    context.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
                    context.strokeStyle = '#14452f';
                    context.lineWidth = 5.2 * grow;
                    context.lineCap = 'round';
                    context.stroke();

                    context.beginPath();
                    context.moveTo(p0.x - 1, p0.y);
                    context.quadraticCurveTo(p1.x - 1, p1.y, p2.x - 1, p2.y);
                    context.strokeStyle = '#2d7a53';
                    context.lineWidth = 2.0 * grow;
                    context.stroke();
                    context.restore();
                }

                // Generate smooth undulating peltate perimeter points (no V-notch!)
                const ptsCount = 36;
                const perimeter = [];
                for (let i = 0; i < ptsCount; i++) {
                    const theta = (i / ptsCount) * Math.PI * 2;
                    // Subtle organic wave along rim
                    const wave = 1 + 0.045 * Math.sin(theta * 5 + this.phase) + 0.025 * Math.cos(theta * 3 - this.phase);
                    const lx = Math.cos(theta) * curRx * wave;
                    const ly = Math.sin(theta) * curRy * wave;
                    const cosR = Math.cos(this.rotation);
                    const sinR = Math.sin(this.rotation);
                    perimeter.push({
                        x: cx + lx * cosR - ly * sinR,
                        y: cy + lx * sinR + ly * cosR,
                        theta
                    });
                }

                context.save();

                // 1. Water shadow beneath floating pad
                if (!this.isAerial) {
                    context.beginPath();
                    traceSmoothSpline(context, perimeter.map(p => ({ x: p.x + 3, y: p.y + 5 })), true);
                    context.closePath();
                    context.fillStyle = 'rgba(2, 8, 18, 0.48)';
                    context.fill();
                }

                // 2. Main velvety emerald-jade peltate leaf body
                context.beginPath();
                traceSmoothSpline(context, perimeter, true);
                context.closePath();

                const leafGrad = context.createRadialGradient(
                    cx - curRx * 0.15, cy - curRy * 0.25, curRx * 0.04,
                    cx, cy, curRx * 1.05
                );
                leafGrad.addColorStop(0, '#3b8c64');
                leafGrad.addColorStop(0.42, '#216345');
                leafGrad.addColorStop(0.85, '#123d2b');
                leafGrad.addColorStop(1, '#0b291d');
                context.fillStyle = leafGrad;
                context.fill();

                // Luminous rim highlight (characteristic upturned margin of Nelumbo leaves)
                context.strokeStyle = 'rgba(134, 239, 172, 0.36)';
                context.lineWidth = 1.35;
                context.stroke();

                // 3. Radiating peltate veins from central umbilicus
                const umbX = cx;
                const umbY = cy - curRy * 0.06;
                const veinCount = 14;
                context.strokeStyle = 'rgba(167, 243, 208, 0.22)';
                context.lineWidth = 0.95;

                for (let v = 0; v < veinCount; v++) {
                    const ang = (v / veinCount) * Math.PI * 2 + this.rotation;
                    const endX = umbX + Math.cos(ang) * curRx * 0.88;
                    const endY = umbY + Math.sin(ang) * curRy * 0.88;
                    const midX = lerp(umbX, endX, 0.52) + Math.sin(ang) * 4;
                    const midY = lerp(umbY, endY, 0.52) - Math.cos(ang) * 2;

                    context.beginPath();
                    context.moveTo(umbX, umbY);
                    context.quadraticCurveTo(midX, midY, endX, endY);
                    context.stroke();
                }

                // Central pale-gold umbilicus dot where stem attaches underneath
                context.beginPath();
                context.ellipse(umbX, umbY, curRx * 0.06, curRy * 0.09, this.rotation, 0, Math.PI * 2);
                context.fillStyle = 'rgba(217, 249, 157, 0.55)';
                context.fill();

                // 4. Glistening water droplet on the hydrophobic lotus leaf
                if (this.hasDew && grow > 0.65) {
                    const dewShimmer = Math.sin(globalTime * 2.1 + this.phase) * 2.2;
                    const dx = umbX + Math.cos(this.dewAngle + this.rotation) * curRx * this.dewDist + dewShimmer;
                    const dy = umbY + Math.sin(this.dewAngle + this.rotation) * curRy * this.dewDist;
                    const dewSize = Math.max(8, curRx * 0.16);

                    context.save();
                    context.globalCompositeOperation = 'screen';
                    context.drawImage(sprites.dew, dx - dewSize, dy - dewSize, dewSize * 2, dewSize * 2);
                    context.restore();
                }

                context.restore();
            }
        }

        // ============================================================================
        // SACRED LOTUS BLOSSOM (3D CONCAVE ACUMINATE PETALS + GOLDEN TORUS SEEDPOD)
        // ============================================================================
        class SacredLotusBloom {
            constructor(options = {}) {
                this.radius = options.radius || 76;
                this.yaw = options.yaw || 0;
                this.pitch = options.pitch || 0.36; // Tilted slightly toward viewer to reveal seedpod
                this.roll = options.roll || 0;
                this.startTime = options.startTime || 0.4;
                this.bloomDuration = options.bloomDuration || 3.8;
                this.maxOpen = options.maxOpen !== undefined ? options.maxOpen : 1.0;
                this.breathPhase = randomRange(0, Math.PI * 2);

                // 3 concentric whorls of broad boat-shaped acuminate petals (8 + 8 + 6 = 22 petals)
                this.whorls = [
                    { count: 8, lenMult: 1.04, widMult: 0.46, openSpread: 1.24, cupDepth: 0.24, angleOffset: 0.0, delayOffset: 0.0 },
                    { count: 8, lenMult: 0.94, widMult: 0.43, openSpread: 0.92, cupDepth: 0.28, angleOffset: Math.PI / 8, delayOffset: 0.12 },
                    { count: 6, lenMult: 0.80, widMult: 0.38, openSpread: 0.56, cupDepth: 0.30, angleOffset: Math.PI / 6, delayOffset: 0.24 }
                ];
            }

            /**
             * Evaluates 3D coordinates of a concave, boat-shaped acuminate lotus petal
             */
            evalLotusPetal3D(whorl, pIdx, u, v, openAmount, R) {
                const baseAngle = (pIdx * Math.PI * 2) / whorl.count + whorl.angleOffset;
                const len = R * whorl.lenMult;
                const maxHalfW = R * whorl.widMult;

                // Broad boat-shaped width tapering to a sharp acuminate lotus tip at u=1
                const boatEnvelope = Math.sin(Math.pow(u, 0.64) * Math.PI);
                const tipPinch = u > 0.72 ? 1 - Math.pow((u - 0.72) / 0.28, 1.7) * 0.42 : 1.0;
                const budFold = lerp(0.36, 1.0, easeOutCubic(openAmount));
                const halfW = maxHalfW * boatEnvelope * tipPinch * budFold;

                // Tilt from vertical bud (0.14 rad) outward to open lotus bowl
                const localOpen = clamp((openAmount - whorl.delayOffset) / (1 - whorl.delayOffset * 0.6), 0, 1);
                const easedOpen = easeInOutCubic(localOpen);
                const tiltAngle = lerp(0.14, whorl.openSpread, easedOpen);

                // Graceful S-curve arch along petal spine + upturned acuminate tip
                const spineCurve = tiltAngle * Math.pow(u, 0.82) - Math.pow(Math.max(0, u - 0.65) / 0.35, 2.0) * 0.22 * easedOpen;
                const radialDist = len * Math.sin(spineCurve) * (0.16 + 0.84 * u);
                const forwardZ = len * Math.cos(spineCurve) * u;

                // Deep boat-like concavity across lateral v (-1..+1)
                const bowlCup = (1 - v * v) * halfW * whorl.cupDepth * (0.4 + 0.6 * easedOpen);

                const px = radialDist - bowlCup * 0.45;
                const py = v * halfW;
                const pz = forwardZ + bowlCup;

                const cosA = Math.cos(baseAngle);
                const sinA = Math.sin(baseAngle);

                return {
                    lx: px * cosA - py * sinA,
                    ly: px * sinA + py * cosA,
                    lz: pz
                };
            }

            draw(context, originX, originY, growthFactor, windSway, scaleMult = 1.0) {
                if (growthFactor <= 0.01) return;

                const R = this.radius * scaleMult * lerp(0.28, 1.0, easeOutCubic(clamp(growthFactor * 1.45, 0, 1)));
                const rawOpen = clamp((growthFactor - 0.15) / 0.85, 0, 1);
                const openAmount = easeInOutCubic(rawOpen) * this.maxOpen;

                const breath = Math.sin(globalTime * 1.25 + this.breathPhase) * 0.025 * openAmount;
                const curYaw = this.yaw + windSway * 0.002;
                const curPitch = this.pitch + breath;
                const curRoll = this.roll + windSway * 0.0012;

                // 1. Luminous Rose-Pink Aura behind bloom (screen-blended cached sprite)
                if (openAmount > 0.08) {
                    const auraSize = R * (2.6 + openAmount * 0.9) * (0.94 + 0.06 * Math.sin(globalTime * 1.5 + this.breathPhase));
                    context.save();
                    context.globalCompositeOperation = 'screen';
                    context.globalAlpha = clamp(openAmount * 0.95, 0, 1);
                    context.drawImage(
                        sprites.roseAura,
                        originX - auraSize,
                        originY - auraSize * 1.15,
                        auraSize * 2,
                        auraSize * 2
                    );
                    context.restore();
                }

                // 2. Build 3D depth-sorted render queue of all 22 petals + central seedpod
                const renderQueue = [];
                const uSteps = 14;

                this.whorls.forEach((whorl, wIdx) => {
                    for (let pIdx = 0; pIdx < whorl.count; pIdx++) {
                        const leftPts = [];
                        const rightPts = [];
                        const centerPts = [];
                        let zSum = 0;

                        for (let i = 0; i <= uSteps; i++) {
                            const u = i / uSteps;
                            const pL3 = this.evalLotusPetal3D(whorl, pIdx, u, -1, openAmount, R);
                            const pR3 = this.evalLotusPetal3D(whorl, pIdx, u, 1, openAmount, R);
                            const pC3 = this.evalLotusPetal3D(whorl, pIdx, u, 0, openAmount, R);

                            const sL = project3D(pL3.lx, pL3.ly, pL3.lz, originX, originY, curYaw, curPitch, curRoll);
                            const sR = project3D(pR3.lx, pR3.ly, pR3.lz, originX, originY, curYaw, curPitch, curRoll);
                            const sC = project3D(pC3.lx, pC3.ly, pC3.lz, originX, originY, curYaw, curPitch, curRoll);

                            leftPts.push(sL);
                            rightPts.push(sR);
                            centerPts.push(sC);
                            zSum += sC.z;
                        }

                        // Inner whorls sit inside outer whorls
                        const avgZ = zSum / (uSteps + 1) + wIdx * 2.4;
                        renderQueue.push({
                            kind: 'petal',
                            wIdx,
                            leftPts,
                            rightPts,
                            centerPts,
                            z: avgZ
                        });
                    }
                });

                const podCenter = project3D(0, 0, R * 0.24, originX, originY, curYaw, curPitch, curRoll);
                renderQueue.push({
                    kind: 'seedpod',
                    z: podCenter.z + 3.2
                });

                renderQueue.sort((a, b) => a.z - b.z);

                // 3. Render sorted 3D petals & golden torus seedpod
                context.save();
                for (let i = 0; i < renderQueue.length; i++) {
                    const item = renderQueue[i];
                    if (item.kind === 'petal') {
                        this.drawSingleLotusPetal(context, item, openAmount, scaleMult);
                    } else if (openAmount > 0.22) {
                        this.drawSeedpodAndStamens(context, originX, originY, openAmount, R, curYaw, curPitch, curRoll, scaleMult);
                    }
                }
                context.restore();
            }

            drawSingleLotusPetal(context, item, openAmount, scaleMult) {
                const { wIdx, leftPts, rightPts, centerPts } = item;
                const uSteps = centerPts.length - 1;
                const basePt = centerPts[0];
                const tipPt = centerPts[uSteps];

                const tracePetal = () => {
                    context.beginPath();
                    context.moveTo(basePt.x, basePt.y);
                    traceSmoothSpline(context, leftPts.slice(1), false);
                    const reversedRight = [];
                    for (let i = uSteps - 1; i >= 1; i--) reversedRight.push(rightPts[i]);
                    traceSmoothSpline(context, reversedRight, false);
                    context.closePath();
                };

                // Soft shadow onto underlying whorl
                context.save();
                context.translate(1.5 * scaleMult, 3.0 * scaleMult);
                tracePetal();
                context.fillStyle = 'rgba(42, 8, 28, 0.24)';
                context.fill();
                context.restore();

                // Pearlescent blush-white base -> vivid rose-magenta acuminate tip
                tracePetal();
                const grad = context.createLinearGradient(basePt.x, basePt.y, tipPt.x, tipPt.y);
                if (wIdx === 0) {
                    grad.addColorStop(0.0, '#fdf2f8');
                    grad.addColorStop(0.35, '#fbcfe8');
                    grad.addColorStop(0.75, '#f472b6');
                    grad.addColorStop(1.0, '#db2777');
                } else if (wIdx === 1) {
                    grad.addColorStop(0.0, '#fffbeb');
                    grad.addColorStop(0.32, '#fce7f3');
                    grad.addColorStop(0.74, '#f9a8d4');
                    grad.addColorStop(1.0, '#ec4899');
                } else {
                    grad.addColorStop(0.0, '#fef9c3');
                    grad.addColorStop(0.38, '#fdf2f8');
                    grad.addColorStop(0.78, '#fbcfe8');
                    grad.addColorStop(1.0, '#f472b6');
                }
                context.fillStyle = grad;
                context.fill();

                // Delicate longitudinal botanical striations inside the petal
                context.beginPath();
                traceSmoothSpline(context, centerPts, true);
                context.strokeStyle = 'rgba(219, 39, 119, 0.16)';
                context.lineWidth = 0.9 * scaleMult;
                context.stroke();

                // Luminous silky rim highlight
                tracePetal();
                context.strokeStyle = 'rgba(255, 241, 248, 0.62)';
                context.lineWidth = 0.85 * scaleMult;
                context.stroke();
            }

            /**
             * Renders the iconic inverted-cone golden torus seedpod & glowing amber stamen crown
             */
            drawSeedpodAndStamens(context, originX, originY, openAmount, R, yaw, pitch, roll, scaleMult) {
                const emerge = easeOutCubic(clamp((openAmount - 0.22) / 0.78, 0, 1));
                const podR = R * 0.21 * emerge;
                const podH = R * 0.26 * emerge;

                const baseProj = project3D(0, 0, R * 0.04, originX, originY, yaw, pitch, roll);
                const topProj = project3D(0, 0, podH, originX, originY, yaw, pitch, roll);

                // Warm golden core glow behind seedpod
                const glowR = R * 0.85 * emerge;
                context.save();
                context.globalCompositeOperation = 'screen';
                context.drawImage(sprites.goldCore, topProj.x - glowR, topProj.y - glowR, glowR * 2, glowR * 2);
                context.restore();

                // 1. Crown of 20 golden-amber stamens ringing the seedpod
                const stamenCount = 20;
                for (let s = 0; s < stamenCount; s++) {
                    const az = (s / stamenCount) * Math.PI * 2;
                    const cosA = Math.cos(az);
                    const sinA = Math.sin(az);

                    const pStart = project3D(cosA * podR * 0.65, sinA * podR * 0.65, podH * 0.45, originX, originY, yaw, pitch, roll);
                    const pEnd = project3D(cosA * podR * 1.48, sinA * podR * 1.48, podH * 1.18, originX, originY, yaw, pitch, roll);

                    context.beginPath();
                    context.moveTo(pStart.x, pStart.y);
                    context.lineTo(pEnd.x, pEnd.y);
                    context.strokeStyle = '#fde047';
                    context.lineWidth = 1.45 * scaleMult;
                    context.lineCap = 'round';
                    context.stroke();

                    context.beginPath();
                    context.arc(pEnd.x, pEnd.y, 1.7 * scaleMult, 0, Math.PI * 2);
                    context.fillStyle = '#f59e0b';
                    context.fill();
                }

                // 2. Inverted-cone receptacle body
                const leftRim = project3D(-podR, 0, podH, originX, originY, yaw, pitch, roll);
                const rightRim = project3D(podR, 0, podH, originX, originY, yaw, pitch, roll);
                const frontRim = project3D(0, podR * 0.85, podH, originX, originY, yaw, pitch, roll);
                const backRim = project3D(0, -podR * 0.85, podH, originX, originY, yaw, pitch, roll);

                context.beginPath();
                context.moveTo(baseProj.x, baseProj.y);
                context.lineTo(leftRim.x, leftRim.y);
                context.lineTo(rightRim.x, rightRim.y);
                context.closePath();
                context.fillStyle = '#d97706';
                context.fill();

                // Flat circular top disk of the seedpod
                const rx = Math.hypot(rightRim.x - leftRim.x, rightRim.y - leftRim.y) * 0.5;
                const ry = Math.max(3, Math.hypot(frontRim.x - backRim.x, frontRim.y - backRim.y) * 0.5);
                const tiltAngle = Math.atan2(rightRim.y - leftRim.y, rightRim.x - leftRim.x);

                context.save();
                context.translate(topProj.x, topProj.y);
                context.rotate(tiltAngle);

                context.beginPath();
                context.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
                context.fillStyle = '#facc15';
                context.fill();
                context.strokeStyle = '#fef08a';
                context.lineWidth = 1.1 * scaleMult;
                context.stroke();

                // Seed dimples arranged in concentric rings on the flat top
                const dimples = [
                    { x: 0, y: 0 },
                    { x: -rx * 0.42, y: 0 },
                    { x: rx * 0.42, y: 0 },
                    { x: 0, y: -ry * 0.45 },
                    { x: 0, y: ry * 0.45 },
                    { x: -rx * 0.3, y: -ry * 0.32 },
                    { x: rx * 0.3, y: ry * 0.32 }
                ];
                dimples.forEach(d => {
                    context.beginPath();
                    context.ellipse(d.x, d.y, rx * 0.11, ry * 0.14, 0, 0, Math.PI * 2);
                    context.fillStyle = '#65a30d';
                    context.fill();
                });

                context.restore();
            }
        }

        // ============================================================================
        // COMPLETE SACRED LOTUS PLANT (STEM + WATER REFLECTION + BLOOM)
        // ============================================================================
        class SacredLotusPlant {
            constructor(options = {}) {
                this.baseX = options.baseX;
                this.baseY = options.baseY;
                this.topX = options.topX;
                this.topY = options.topY;
                this.ctrlX = options.ctrlX || lerp(this.baseX, this.topX, 0.48) + randomRange(-24, 24);
                this.ctrlY = options.ctrlY || lerp(this.baseY, this.topY, 0.52);
                this.depthScale = options.depthScale || 1.0;
                this.delay = options.delay || 0;
                this.stemDuration = options.stemDuration || 1.8;
                this.windPhase = randomRange(0, Math.PI * 2);
                this.age = -this.delay;
                this.bloom = options.bloom;
            }

            update(dt) {
                this.age += dt;
            }

            draw(context) {
                if (this.age < 0) return;

                const stemProgress = easeOutCubic(clamp(this.age / this.stemDuration, 0, 1));
                if (stemProgress <= 0.005) return;

                const sway = (Math.sin(globalTime * 1.1 + this.windPhase) * 8.0 + windVelocity * 15.0) * this.depthScale;
                const p0 = { x: this.baseX, y: this.baseY };
                const p1 = { x: this.ctrlX + sway * 0.38, y: this.ctrlY };
                const p2 = { x: this.topX + sway, y: this.topY };

                const curTip = evalQuadBezier(p0, p1, p2, stemProgress);
                const curCtrl = {
                    x: lerp(p0.x, p1.x, stemProgress),
                    y: lerp(p0.y, p1.y, stemProgress)
                };

                // 1. Rippled reflection in the pond water beneath stem emergence point
                context.save();
                const reflAlpha = 0.22 * stemProgress;
                context.strokeStyle = `rgba(244, 114, 182, ${reflAlpha})`;
                context.lineWidth = 2.0 * this.depthScale;
                for (let r = 1; r <= 4; r++) {
                    const ry = p0.y + r * 7 * this.depthScale;
                    const rw = (18 - r * 3) * this.depthScale + Math.sin(globalTime * 2 + r) * 3;
                    context.beginPath();
                    context.moveTo(p0.x - rw, ry);
                    context.lineTo(p0.x + rw, ry);
                    context.stroke();
                }

                // Water surface ring where stem emerges
                context.beginPath();
                context.ellipse(p0.x, p0.y, 16 * this.depthScale, 5.5 * this.depthScale, 0, 0, Math.PI * 2);
                context.strokeStyle = 'rgba(186, 230, 253, 0.28)';
                context.lineWidth = 1.1;
                context.stroke();

                // 2. Smooth cylindrical lotus stem rising from water
                context.lineCap = 'round';
                context.beginPath();
                context.moveTo(p0.x, p0.y);
                context.quadraticCurveTo(curCtrl.x, curCtrl.y, curTip.x, curTip.y);
                context.strokeStyle = '#14452f';
                context.lineWidth = 6.5 * this.depthScale;
                context.stroke();

                context.beginPath();
                context.moveTo(p0.x - 1.2 * this.depthScale, p0.y);
                context.quadraticCurveTo(curCtrl.x - 1.2 * this.depthScale, curCtrl.y, curTip.x - 1.2 * this.depthScale, curTip.y);
                context.strokeStyle = '#34855d';
                context.lineWidth = 2.4 * this.depthScale;
                context.stroke();
                context.restore();

                // 3. Draw Sacred Lotus flower head at stem tip
                const bloomStartAge = this.bloom.startTime * this.stemDuration;
                const bloomGrowth = clamp((this.age - bloomStartAge) / this.bloom.bloomDuration, 0, 1);
                this.bloom.draw(context, curTip.x, curTip.y, bloomGrowth, sway, this.depthScale);
            }
        }

        // ============================================================================
        // CONCENTRIC WATER RIPPLES & GOLDEN FIREFLIES
        // ============================================================================
        function spawnRipple(x, y, maxR = 95) {
            ripples.push({
                x,
                y: Math.max(y, horizonY + 8),
                radius: 4,
                maxRadius: maxR,
                alpha: 0.65
            });
            if (ripples.length > 24) ripples.shift();
        }

        function updateAndDrawRipples(context, dt) {
            context.save();
            for (let i = ripples.length - 1; i >= 0; i--) {
                const rp = ripples[i];
                rp.radius += 42 * dt;
                const progress = rp.radius / rp.maxRadius;
                if (progress >= 1) {
                    ripples.splice(i, 1);
                    continue;
                }

                const alpha = rp.alpha * (1 - progress) * (1 - progress);
                // 2.5D perspective ellipse on water surface
                const rx = rp.radius;
                const ry = rp.radius * 0.34;

                context.beginPath();
                context.ellipse(rp.x, rp.y, rx, ry, 0, 0, Math.PI * 2);
                context.strokeStyle = `rgba(186, 230, 253, ${alpha})`;
                context.lineWidth = 1.4;
                context.stroke();

                if (rx > 18) {
                    context.beginPath();
                    context.ellipse(rp.x, rp.y, rx * 0.68, ry * 0.68, 0, 0, Math.PI * 2);
                    context.strokeStyle = `rgba(244, 114, 182, ${alpha * 0.65})`;
                    context.lineWidth = 1.0;
                    context.stroke();
                }
            }
            context.restore();
        }

        function initFireflies() {
            const count = clamp(Math.floor((width * height) / 34000), 14, 34);
            fireflies = [];
            for (let i = 0; i < count; i++) {
                fireflies.push({
                    x: randomRange(0, width),
                    y: randomRange(height * 0.12, height * 0.88),
                    vx: randomRange(-8, 8),
                    vy: randomRange(-12, -3),
                    size: randomRange(8, 16),
                    phase: randomRange(0, Math.PI * 2),
                    speed: randomRange(1.2, 2.5)
                });
            }
        }

        function updateAndDrawFireflies(context, dt) {
            context.save();
            context.globalCompositeOperation = 'screen';
            for (let i = 0; i < fireflies.length; i++) {
                const f = fireflies[i];
                f.x += (f.vx + windVelocity * 16) * dt + Math.sin(globalTime * 1.3 + f.phase) * 0.22;
                f.y += f.vy * dt;

                if (f.y < -15) {
                    f.y = height + 15;
                    f.x = randomRange(0, width);
                }
                if (f.x < -15) f.x = width + 15;
                if (f.x > width + 15) f.x = -15;

                const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(globalTime * f.speed + f.phase));
                context.globalAlpha = twinkle;
                context.drawImage(sprites.firefly, f.x - f.size, f.y - f.size, f.size * 2, f.size * 2);
            }
            context.restore();
        }

        // ============================================================================
        // HERO LOTUS POND COMPOSITION & INTERACTIVE PLANTING
        // ============================================================================
        function seedLotusPond() {
            lotusPlants = [];
            floatingPads = [];
            ripples = [];

            const minDim = Math.min(width, height);
            const heroScale = clamp(minDim / 680, 0.72, 1.24);
            const cx = width * 0.5;
            const waterMidY = lerp(horizonY, height, 0.56);

            // 1. Floating peltate lotus pads arranged in natural pond clusters
            const padSpecs = [
                { x: cx - 155 * heroScale, y: waterMidY + 38 * heroScale, rx: 86 * heroScale, delay: 0.1 },
                { x: cx - 55 * heroScale,  y: waterMidY + 62 * heroScale, rx: 98 * heroScale, delay: 0.2 },
                { x: cx + 75 * heroScale,  y: waterMidY + 48 * heroScale, rx: 92 * heroScale, delay: 0.15 },
                { x: cx + 175 * heroScale, y: waterMidY + 22 * heroScale, rx: 78 * heroScale, delay: 0.3 },
                { x: cx - 220 * heroScale, y: waterMidY - 12 * heroScale, rx: 64 * heroScale, delay: 0.35 },
                { x: cx + 25 * heroScale,  y: waterMidY - 18 * heroScale, rx: 68 * heroScale, delay: 0.25 },
                // Two towering aerial peltate leaves cupping gracefully above the water
                {
                    x: cx - 132 * heroScale,
                    y: waterMidY - 82 * heroScale,
                    rx: 68 * heroScale,
                    ry: 26 * heroScale,
                    isAerial: true,
                    stemBaseX: cx - 115 * heroScale,
                    stemBaseY: waterMidY + 24 * heroScale,
                    rotation: -0.14,
                    delay: 0.4
                },
                {
                    x: cx + 148 * heroScale,
                    y: waterMidY - 64 * heroScale,
                    rx: 62 * heroScale,
                    ry: 24 * heroScale,
                    isAerial: true,
                    stemBaseX: cx + 128 * heroScale,
                    stemBaseY: waterMidY + 32 * heroScale,
                    rotation: 0.16,
                    delay: 0.5
                }
            ];

            padSpecs.forEach(spec => floatingPads.push(new PeltateLotusLeaf(spec)));
            floatingPads.sort((a, b) => a.y - b.y);

            // 2. Hero Sacred Lotus blooms + slowly unfurling rose-pink bud
            const centerHero = new SacredLotusPlant({
                baseX: cx - 8 * heroScale,
                baseY: waterMidY + 44 * heroScale,
                ctrlX: cx - 18 * heroScale,
                ctrlY: waterMidY - 48 * heroScale,
                topX: cx - 12 * heroScale,
                topY: waterMidY - 126 * heroScale,
                depthScale: heroScale * 1.08,
                delay: 0.15,
                stemDuration: 1.75,
                bloom: new SacredLotusBloom({
                    radius: 82,
                    yaw: -0.08,
                    pitch: 0.42,
                    roll: -0.05,
                    startTime: 0.42,
                    bloomDuration: 3.4,
                    maxOpen: 1.0
                })
            });

            const leftCompanion = new SacredLotusPlant({
                baseX: cx - 92 * heroScale,
                baseY: waterMidY + 32 * heroScale,
                ctrlX: cx - 108 * heroScale,
                ctrlY: waterMidY - 32 * heroScale,
                topX: cx - 98 * heroScale,
                topY: waterMidY - 86 * heroScale,
                depthScale: heroScale * 0.94,
                delay: 0.35,
                stemDuration: 1.7,
                bloom: new SacredLotusBloom({
                    radius: 72,
                    yaw: -0.24,
                    pitch: 0.36,
                    roll: -0.12,
                    startTime: 0.45,
                    bloomDuration: 3.6,
                    maxOpen: 0.95
                })
            });

            const rightCompanion = new SacredLotusPlant({
                baseX: cx + 74 * heroScale,
                baseY: waterMidY + 40 * heroScale,
                ctrlX: cx + 92 * heroScale,
                ctrlY: waterMidY - 26 * heroScale,
                topX: cx + 86 * heroScale,
                topY: waterMidY - 76 * heroScale,
                depthScale: heroScale * 0.96,
                delay: 0.45,
                stemDuration: 1.7,
                bloom: new SacredLotusBloom({
                    radius: 74,
                    yaw: 0.22,
                    pitch: 0.38,
                    roll: 0.1,
                    startTime: 0.46,
                    bloomDuration: 3.5,
                    maxOpen: 0.96
                })
            });

            // Pointed rose-pink lotus bud on the right that gradually opens
            const rightBud = new SacredLotusPlant({
                baseX: cx + 112 * heroScale,
                baseY: waterMidY + 18 * heroScale,
                ctrlX: cx + 124 * heroScale,
                ctrlY: waterMidY - 52 * heroScale,
                topX: cx + 118 * heroScale,
                topY: waterMidY - 118 * heroScale,
                depthScale: heroScale * 0.88,
                delay: 0.3,
                stemDuration: 1.65,
                bloom: new SacredLotusBloom({
                    radius: 66,
                    yaw: 0.14,
                    pitch: 0.22,
                    roll: 0.08,
                    startTime: 0.4,
                    bloomDuration: 16.0,
                    maxOpen: 0.92
                })
            });

            lotusPlants.push(rightBud, leftCompanion, rightCompanion, centerHero);
            lotusPlants.sort((a, b) => a.baseY - b.baseY);
        }

        function plantInteractiveLotus(x, y) {
            const clampedY = clamp(y, horizonY + 18, height - 24);
            spawnRipple(x, clampedY, 105);

            if (lotusPlants.length >= 12) {
                lotusPlants.splice(0, 1);
            }

            const depthFactor = clamp((clampedY - horizonY) / Math.max(height - horizonY, 1), 0.15, 1.0);
            const minDim = Math.min(width, height);
            const baseScale = clamp(minDim / 680, 0.72, 1.22);
            const scale = baseScale * lerp(0.68, 1.14, depthFactor);

            // Add a supporting floating pad near the new lotus
            if (floatingPads.length < 18) {
                floatingPads.push(new PeltateLotusLeaf({
                    x: x + randomRange(-36, 36) * scale,
                    y: clampedY + randomRange(4, 16) * scale,
                    rx: randomRange(62, 86) * scale,
                    delay: 0
                }));
                floatingPads.sort((a, b) => a.y - b.y);
            }

            const stemHeight = randomRange(115, 165) * scale;
            const newLotus = new SacredLotusPlant({
                baseX: x,
                baseY: clampedY,
                topX: x + randomRange(-18, 18) * scale,
                topY: clampedY - stemHeight,
                depthScale: scale,
                delay: 0,
                stemDuration: randomRange(1.4, 1.8),
                bloom: new SacredLotusBloom({
                    radius: randomRange(70, 84),
                    yaw: randomRange(-0.26, 0.26),
                    pitch: randomRange(0.32, 0.46),
                    roll: randomRange(-0.14, 0.14),
                    startTime: 0.42,
                    bloomDuration: randomRange(2.8, 3.6),
                    maxOpen: 1.0
                })
            });

            lotusPlants.push(newLotus);
            lotusPlants.sort((a, b) => a.baseY - b.baseY);
        }

        // ============================================================================
        // MAIN 60 FPS ANIMATION LOOP & EVENTS
        // ============================================================================
        function resizeCanvas() {
            width = window.innerWidth;
            height = window.innerHeight;
            dpr = Math.min(window.devicePixelRatio || 1, 1);

            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            rebuildBackgroundCache();
            initFireflies();
            seedLotusPond();
        }

        function animate(timestamp) {
            if (lastTimestamp && timestamp - lastTimestamp < 1000 / 30) {
                requestAnimationFrame(animate);
                return;
            }
            if (!lastTimestamp) lastTimestamp = timestamp;
            const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
            lastTimestamp = timestamp;
            globalTime += dt;

            windVelocity = lerp(windVelocity, windTarget, clamp(dt * 3.5, 0, 1));
            windTarget *= Math.pow(0.25, dt);

            // Periodic gentle pond ripples
            autoRippleTimer += dt;
            if (autoRippleTimer > 2.8) {
                autoRippleTimer = 0;
                spawnRipple(randomRange(width * 0.15, width * 0.85), randomRange(horizonY + 25, height * 0.9), 75);
            }

            // 1. Blit cached moonlit pond backdrop in a single GPU-accelerated drawImage
            ctx.drawImage(bgCanvas, 0, 0, width, height);

            // 2. Render expanding 2.5D water ripples
            updateAndDrawRipples(ctx, dt);

            // 3. Render floating peltate pads (on water surface)
            const sway = Math.sin(globalTime * 1.1) * 6.0 + windVelocity * 14.0;
            for (let i = 0; i < floatingPads.length; i++) {
                if (!floatingPads[i].isAerial) {
                    floatingPads[i].draw(ctx, globalTime, sway);
                }
            }

            // 4. Update & render Sacred Lotus stems and blooms
            for (let i = 0; i < lotusPlants.length; i++) {
                lotusPlants[i].update(dt);
                lotusPlants[i].draw(ctx);
            }

            // 5. Render towering aerial peltate leaves
            for (let i = 0; i < floatingPads.length; i++) {
                if (floatingPads[i].isAerial) {
                    floatingPads[i].draw(ctx, globalTime, sway);
                }
            }

            // 6. Render drifting golden fireflies
            updateAndDrawFireflies(ctx, dt);

            requestAnimationFrame(animate);
        }

        canvas.addEventListener('pointermove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const nx = e.clientX - rect.left;
            const dx = nx - pointerX;
            pointerX = nx;
            windTarget = clamp(windTarget + dx * 0.025, -1.6, 1.6);
        });

        canvas.addEventListener('pointerdown', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            windTarget = clamp(windTarget + (x < width * 0.5 ? -0.8 : 0.8), -1.6, 1.6);
            plantInteractiveLotus(x, y);
        });

        window.addEventListener('resize', resizeCanvas);

        initGlowSprites();
        resizeCanvas();
        requestAnimationFrame(animate);
