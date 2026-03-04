"use client";

import { motion, Variants, useScroll, useTransform } from "framer-motion";
export function AnimatedHeroContent() {
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
                delayChildren: 0.1,
            },
        },
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                type: "spring",
                stiffness: 100,
                damping: 15,
            },
        },
    };

    const { scrollY } = useScroll();
    const y = useTransform(scrollY, [0, 500], [0, 150]);
    const opacity = useTransform(scrollY, [0, 400], [1, 0]);

    return (
        <motion.div
            className="max-w-3xl"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            style={{ y, opacity }}
        >
            <motion.h1 variants={itemVariants} className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] mb-5">
                <span className="text-stone-100">Your shortcut</span>
                <br />
                <span className="text-white">to the mix.</span>
            </motion.h1>

            <motion.p variants={itemVariants} className="text-lg text-stone-400 max-w-xl leading-relaxed mb-3">
                A collection of powerful mixing tools in one unified interface.
            </motion.p>

            <motion.p variants={itemVariants} className="text-base text-stone-300 font-medium max-w-xl mb-3">
                Fast, ergonomic and crash-safe.
            </motion.p>

            <motion.p variants={itemVariants} className="text-sm text-stone-500 max-w-lg leading-relaxed mb-8 italic">
                It&apos;s not about mixing faster. It&apos;s about never feeling like your tools are in the way.
            </motion.p>

            <motion.div variants={itemVariants} className="flex flex-wrap gap-3">
                <a
                    href="/pricing"
                    className="neon-button inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm"
                >
                    Start Free Trial
                </a>
                <a
                    href="/chains"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-white/[0.05] hover:bg-white/[0.08] text-stone-200 font-medium rounded-xl transition-all border border-white/[0.08] text-sm"
                >
                    Explore Chains
                </a>
            </motion.div>

            <motion.p variants={itemVariants} className="text-stone-600 text-xs mt-4">
                7-day free trial. Then $30 (50% off launch sale). No subscription.
            </motion.p>
        </motion.div>
    );
}
