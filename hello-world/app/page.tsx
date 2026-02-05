'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'

export default function Page() {
    const [tables, setTables] = useState<any[]>([])

    useEffect(() => {
        supabase
            .from('caption_examples')
            .select('*')
            .then(({ data }) => setTables(data ?? []))
    }, [])

    return (
        <div>
            <h1>caption_examples tables</h1>
            <ul>
                {tables.map((table: any) => (
                    <li key={table.id}>
                        <strong>ID:</strong> {table.id}<br />
                        <strong>Date:</strong> {table.created_datetime_utc}<br />
                        <strong>Date modified:</strong> {table.modified_created_datetime_utc}<br />
                        <strong>Description:</strong> {table.image_description}<br />
                        <strong>Caption:</strong> {table.caption}<br />
                        <strong>Explanation:</strong> {table.explanation}<br />
                        <strong>Priority:</strong> {table.priority}<br />
                        <strong>image id:</strong> {table.image_id}<br />
                    </li>
                ))}
            </ul>
        </div>
    )
}
