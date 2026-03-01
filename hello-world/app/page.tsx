'use client'

import { supabase } from '../lib/supabase/client'
import React, { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import styles from './Page.module.css'

export default function Page() {
    const [user, setUser] = useState<any>(null)
    const [images, setImages] = useState<Record<string, string>>({})
    const [captions, setCaptions] = useState<any[]>([])
    const [activeTab, setActiveTab] = useState<'Rating' | 'Upload'>('Rating')
    const [page, setPage] = useState(0)
    const [currentIndex, setCurrentIndex] = useState(0)

    const [uploadProgress, setUploadProgress] = useState(0)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const [uploadSuccess, setUploadSuccess] = useState(false)

    // NEW: local state for uploaded image + its captions
    const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
    const [uploadedCaptions, setUploadedCaptions] = useState<
        { id: string; caption: string; content: string }[]
    >([])
    const [uploadedCaptionIndex, setUploadedCaptionIndex] = useState(0)

    const ITEMS_PER_PAGE = 20

    /* ================= AUTH ================= */

    useEffect(() => {
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            setUser(session?.user ?? null)
        }

        getSession()

        const { data: { subscription } } =
            supabase.auth.onAuthStateChange((_event, session) => {
                setUser(session?.user ?? null)
            })

        return () => subscription.unsubscribe()
    }, [])

    /* ================= DATA (RATING MODE) ================= */

    useEffect(() => {
        if (activeTab === 'Rating') loadRatingData()
    }, [activeTab, page])

    const loadRatingData = async () => {
        const captionsData = await fetchCaptions(page)
        if (captionsData?.length) {
            const ids = [...new Set(captionsData.map((c: any) => c.image_id))]
            await fetchImages(ids)
        }
    }

    const fetchCaptions = async (currentPage: number) => {
        const from = currentPage * ITEMS_PER_PAGE
        const to = from + ITEMS_PER_PAGE - 1

        const { data, error } = await supabase
            .from('captions')
            .select('*')
            .range(from, to)
            .order('id', { ascending: true })

        if (error) return []

        setCaptions(data ?? [])
        return data ?? []
    }

    const fetchImages = async (imageIds: string[]) => {
        if (!imageIds.length) return

        const { data } = await supabase
            .from('images')
            .select('id, url')
            .in('id', imageIds)

        const dict: Record<string, string> = {}
        data?.forEach(img => { dict[img.id] = img.url })

        setImages(dict)
    }

    /* ================= UPLOAD FLOW (UPLOAD MODE) ================= */

    // Now only called when user hits "Submit" in Upload mode
    const handleFileUpload = async () => {
        if (!user || !selectedFile) return

        const file = selectedFile

        try {
            setUploading(true)
            setUploadProgress(10)
            setUploadSuccess(false)
            setUploadedCaptions([])
            setUploadedCaptionIndex(0)
            setUploadedImageUrl(null)

            // 1️⃣ Get JWT token
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            if (!token) throw new Error('No auth token')

            // 2️⃣ Generate presigned URL
            const presignRes = await fetch(
                'https://api.almostcrackd.ai/pipeline/generate-presigned-url',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contentType: file.type
                    })
                }
            )

            if (!presignRes.ok) throw new Error('Failed to generate presigned URL')

            const { presignedUrl, cdnUrl } = await presignRes.json()

            setUploadProgress(30)

            // 3️⃣ Upload image to S3
            const uploadRes = await fetch(presignedUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': file.type
                },
                body: file
            })

            if (!uploadRes.ok) throw new Error('Failed to upload to S3')

            setUploadProgress(60)

            // 4️⃣ Register image with pipeline
            const registerRes = await fetch(
                'https://api.almostcrackd.ai/pipeline/upload-image-from-url',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        imageUrl: cdnUrl,
                        isCommonUse: false
                    })
                }
            )

            if (!registerRes.ok) throw new Error('Failed to register image')

            const { imageId } = await registerRes.json()

            setUploadProgress(80)

            // 5️⃣ Generate captions
            const captionRes = await fetch(
                'https://api.almostcrackd.ai/pipeline/generate-captions',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        imageId
                    })
                }
            )

            if (!captionRes.ok) throw new Error('Failed to generate captions')

            const generatedCaptions = await captionRes.json()

            console.log('Generated captions response:')
            console.log(generatedCaptions)
            console.log('Is array:', Array.isArray(generatedCaptions))

            setUploadProgress(100)

            // 6️⃣ Save captions to Supabase
            if (Array.isArray(generatedCaptions)) {
                const rows = generatedCaptions.map((c: any) => ({
                    id: c.id,
                    caption: c.caption,
                    content: c.content,
                    image_id: imageId,
                    created_datetime_utc: new Date().toISOString(),
                    modified_datetime_utc: new Date().toISOString()
                }))

                await supabase.from('captions').insert(rows)

                // store locally for carousel
                setUploadedCaptions(
                    generatedCaptions.map((c: any) => ({
                        id: c.id,
                        caption: c.caption,
                        content: c.content
                    }))
                )
                setUploadedCaptionIndex(0)
            }

            // store uploaded image URL locally (center image)
            setUploadedImageUrl(cdnUrl)

            setUploadSuccess(true)

        } catch (err) {
            console.error(err)
            alert('Upload & caption generation failed')
        } finally {
            setUploading(false)
        }
    }

    const deleteUploadedImage = async () => {
        if (!uploadedFileName) {
            setSelectedFile(null)
            setUploadProgress(0)
            setUploadSuccess(false)
            setUploadedImageUrl(null)
            setUploadedCaptions([])
            setUploadedCaptionIndex(0)
            return
        }

        try {
            await supabase.storage.from('images').remove([uploadedFileName])

            setSelectedFile(null)
            setUploadedFileName(null)
            setUploadProgress(0)
            setUploadSuccess(false)
            setUploadedImageUrl(null)
            setUploadedCaptions([])
            setUploadedCaptionIndex(0)
        } catch (err) {
            console.error(err)
            alert('Failed to delete image')
        }
    }

    /* ================= VOTING (RATING MODE) ================= */

    const submitVote = async (vote_value: number, caption_id: string) => {
        if (!user) return

        await supabase.from('caption_votes').insert([{
            created_datetime_utc: new Date().toISOString(),
            modified_datetime_utc: new Date().toISOString(),
            profile_id: user.id,
            caption_id,
            vote_value
        }])
    }

    const validCaptions = useMemo(
        () => captions.filter(c => images[c.image_id]),
        [captions, images]
    )

    const handleVote = (value: number, id: string) => {
        submitVote(value, id)
        setCurrentIndex(i => i + 1)
    }

    /* ================= RENDER ================= */

    if (!user) {
        return (
            <div className={styles.appBackground}>
                <div className={styles.centeredContainer}>
                    <div className={styles.centeredInner}>
                        <h2 className={styles.pageTitle}>Welcome to caption rating</h2>
                        <button
                            onClick={() =>
                                supabase.auth.signInWithOAuth({
                                    provider: 'google',
                                    options: {
                                        redirectTo: `${window.location.origin}/auth/callback`,
                                    },
                                })
                            }
                            className={styles.button}
                        >
                            Sign in with Google
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.appBackground}>
            <Navbar
                user={user}
                onLogout={async () => {
                    await supabase.auth.signOut()
                    setUser(null)
                }}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
            />

            {activeTab === 'Rating' ? (
                /* ================= RATING MODE ================= */
                <div className={styles.pageWrapperCentered}>
                    <h1 className={styles.pageTitle}>Rate Captions</h1>

                    <div className={styles.cardStack}>
                        {validCaptions
                            .slice(currentIndex, currentIndex + 2)
                            .reverse()
                            .map((caption, index) => {
                                const isTop = index === 0

                                return (
                                    <motion.div
                                        key={caption.id}
                                        className={styles.swipeCard}
                                        drag={isTop ? 'x' : false}
                                        dragConstraints={{ left: 0, right: 0 }}
                                        onDragEnd={(e, info) => {
                                            if (!isTop) return
                                            if (info.offset.x > 120) handleVote(1, caption.id)
                                            if (info.offset.x < -120) handleVote(-1, caption.id)
                                        }}
                                        initial={{ scale: isTop ? 1 : 0.95 }}
                                        animate={{
                                            scale: isTop ? 1 : 0.95,
                                            y: isTop ? 0 : 10
                                        }}
                                        style={{ zIndex: isTop ? 2 : 1 }}
                                    >
                                        <img
                                            src={images[caption.image_id]}
                                            className={styles.cardImage}
                                            alt=""
                                        />

                                        <div className={styles.cardContent}>
                                            <h3 className={styles.cardCaption}>
                                                {caption.caption}
                                            </h3>
                                            <p className={styles.cardDescription}>
                                                {caption.content}
                                            </p>
                                        </div>
                                    </motion.div>
                                )
                            })}

                        {currentIndex >= validCaptions.length && (
                            <div className={styles.loadMoreCard}>
                                <button
                                    onClick={() => {
                                        setCurrentIndex(0)
                                        setPage(p => p + 1)
                                    }}
                                    className={styles.button}
                                >
                                    Load More Images
                                </button>
                            </div>
                        )}
                    </div>

                    {validCaptions[currentIndex] && (
                        <div className={styles.voteControls}>
                            <button
                                className={styles.downvoteButtonLarge}
                                onClick={() =>
                                    handleVote(-1, validCaptions[currentIndex].id)
                                }
                            >
                                ⬅ Downvote
                            </button>

                            <button
                                className={styles.upvoteButtonLarge}
                                onClick={() =>
                                    handleVote(1, validCaptions[currentIndex].id)
                                }
                            >
                                Upvote ➡
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                /* ================= UPLOAD MODE ================= */
                <div className={styles.pageWrapperCentered}>
                    <h1 className={styles.pageTitle}>Upload Your Photos to Generate your Captions</h1>

                    {/* If we already uploaded successfully, only show image + carousel */}
                    {uploadSuccess && uploadedImageUrl && uploadedCaptions.length > 0 ? (
                        <div className={styles.uploadPreviewSection}>
                            <div className={styles.uploadPreviewImageWrapper}>
                                <img
                                    src={uploadedImageUrl}
                                    alt="Uploaded"
                                    className={styles.uploadPreviewImage}
                                />
                            </div>

                            <div className={styles.captionCarousel}>
                                <button
                                    type="button"
                                    className={`${styles.carouselNavButton} ${styles.navLogout}`}
                                    onClick={() =>
                                        setUploadedCaptionIndex((prev) =>
                                            prev === 0
                                                ? uploadedCaptions.length - 1
                                                : prev - 1
                                        )
                                    }
                                >
                                    ◀
                                </button>

                                <div className={styles.captionCarouselContent}>
                                    <h3 className={styles.carouselCaptionTitle}>
                                        {uploadedCaptions[uploadedCaptionIndex].caption}
                                    </h3>
                                    <p className={styles.carouselCaptionBody}>
                                        {uploadedCaptions[uploadedCaptionIndex].content}
                                    </p>

                                    <div className={styles.carouselDots}>
                                        {uploadedCaptions.map((c, idx) => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() => setUploadedCaptionIndex(idx)}
                                                className={`${styles.carouselDot} ${
                                                    idx === uploadedCaptionIndex
                                                        ? styles.carouselDotActive
                                                        : ''
                                                }`}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    className={`${styles.carouselNavButton} ${styles.navLogout}`}
                                    onClick={() =>
                                        setUploadedCaptionIndex((prev) =>
                                            prev === uploadedCaptions.length - 1
                                                ? 0
                                                : prev + 1
                                        )
                                    }
                                >
                                    ▶
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Step 1: select file + preview + submit button */}
                            <div
                                className={styles.uploadCard}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    const file = e.dataTransfer.files?.[0]
                                    if (file) {
                                        setSelectedFile(file)
                                        setUploadProgress(0)
                                        setUploadSuccess(false)
                                        setUploadedImageUrl(null)
                                        setUploadedCaptions([])
                                        setUploadedCaptionIndex(0)
                                    }
                                }}
                            >
                                <div className={styles.uploadDropzone}>
                                    <div/>

                                    <p className={styles.uploadTitle}>
                                        Drop your image here, or <span className={styles.uploadBrowse}>browse</span>
                                    </p>
                                    <p className={styles.uploadSubtext}>
                                        Supports: JPEG, JPG, PNG, WEBP, GIF and HEIC
                                    </p>

                                    <input
                                        type="file"
                                        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic"
                                        className={styles.uploadInput}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) {
                                                setSelectedFile(file)
                                                setUploadProgress(0)
                                                setUploadSuccess(false)
                                                setUploadedImageUrl(null)
                                                setUploadedCaptions([])
                                                setUploadedCaptionIndex(0)
                                            }
                                        }}
                                    />
                                </div>

                                {selectedFile && (
                                    <>
                                        <div className={styles.fileRow}>
                                            <div className={styles.fileLeft}>
                                                <div className={styles.fileAvatar}>
                                                    {selectedFile.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className={styles.fileMeta}>
                                                    <div className={styles.fileName}>
                                                        {selectedFile.name}{' '}
                                                        <span className={styles.fileAttached}>· attached</span>
                                                    </div>
                                                    <div className={styles.fileSize}>
                                                        {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                                                    </div>
                                                </div>
                                            </div>

                                            <div className={styles.fileRight}>
                                                <button
                                                    className={styles.deleteIconButton}
                                                    type="button"
                                                    onClick={deleteUploadedImage}
                                                    disabled={uploading}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>

                                        <div className={styles.progressBarOuter}>
                                            <div
                                                className={styles.progressBarInner}
                                                style={{ width: `${uploadProgress}%` }}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Submit button to actually upload + generate captions */}
                            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                                <button
                                    type="button"
                                    onClick={handleFileUpload}
                                    className={styles.navLogout}
                                    disabled={!selectedFile || uploading}
                                >
                                    {uploading ? 'Uploading...' : 'Submit & Generate Captions'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

/* ================= NAVBAR ================= */

function Navbar({ user, onLogout, activeTab, setActiveTab }: any) {
    const items: ('Rating' | 'Upload')[] = ['Rating', 'Upload']

    return (
        <div className={styles.navbar}>
            <div className={styles.navInner}>
                <div
                    className={styles.navIndicator}
                    style={{
                        transform:
                            activeTab === 'Rating'
                                ? 'translateX(0%)'
                                : 'translateX(100%)'
                    }}
                />
                {items.map((item) => (
                    <button
                        key={item}
                        onClick={() => setActiveTab(item)}
                        className={`${styles.navItem} ${
                            activeTab === item ? styles.navItemActive : ''
                        }`}
                    >
                        {item}
                    </button>
                ))}
            </div>

            <div className={styles.navRight}>
                <span className={styles.navEmail}>{user?.email}</span>
                <button
                    onClick={onLogout}
                    className={styles.navLogout}
                >
                    Sign Out
                </button>
            </div>
        </div>
    )
}
