// frontend/src/components/VirtualList.jsx
import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';

/**
 * Ảo hoá danh sách (windowing): chỉ render các item thực sự nằm trong
 * viewport (+ overscan phía trên/dưới để cuộn không bị giật trắng), thay
 * vì render toàn bộ mảng `items` vào DOM cùng lúc.
 *
 * Cap số lượng item tối đa (MAX_FEED_ITEMS = 200, NFR-PERF-05, chống tràn
 * bộ nhớ trình duyệt) đã xử lý sẵn ở useLiveSocket.js -- component này
 * KHÔNG thêm giới hạn nào mới lên `items`, chỉ quyết định trong đúng số
 * item đó, bao nhiêu node thực sự cần có mặt trong DOM tại một thời điểm.
 *
 * Đánh đổi có chủ đích: mỗi item phải có chiều cao CỐ ĐỊNH = itemHeight
 * (đã bao gồm cả khoảng cách bottom giữa các dòng, nếu có -- xem comment
 * ở .feed-row/.chat-row/.gift-row/.join-row trong App.css). Fixed-height
 * virtualization tính toán vị trí bằng phép nhân đơn giản (index *
 * itemHeight), không cần đo lại DOM sau mỗi lần render -- dynamic-height
 * virtualization (mỗi item cao khác nhau, đo bằng ResizeObserver) phức
 * tạp hơn nhiều và không cần thiết cho 3 loại row có layout đã biết trước.
 */
export default function VirtualList({ items, itemHeight, renderItem, overscan = 6, className, emptyState }) {
    const containerRef = useRef(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);
    const rafRef = useRef(null);

    // useLayoutEffect (không phải useEffect) để đo chiều cao container
    // TRƯỚC lần paint đầu tiên -- tránh nhấp nháy render 0 dòng rồi mới
    // nhảy lên đúng số dòng ngay sau đó.
    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        setContainerHeight(el.clientHeight);

        if (typeof ResizeObserver === 'undefined') return; // môi trường cũ/test: bỏ qua, vẫn hoạt động với chiều cao đo lần đầu
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) setContainerHeight(entry.contentRect.height);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Throttle theo animation frame: nhiều sự kiện scroll dồn dập chỉ tính
    // lại danh sách hiển thị tối đa 1 lần mỗi frame, không phải mỗi pixel.
    const handleScroll = useCallback(() => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            if (containerRef.current) {
                setScrollTop(containerRef.current.scrollTop);
            }
        });
    }, []);

    useEffect(() => {
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    if (items.length === 0) {
        return (
            <div className={className} ref={containerRef}>
                {emptyState}
            </div>
        );
    }

    const totalHeight = items.length * itemHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight) + overscan * 2;
    const endIndex = Math.min(items.length, startIndex + Math.max(visibleCount, 0));

    const topSpacerHeight = startIndex * itemHeight;
    const bottomSpacerHeight = Math.max(0, totalHeight - endIndex * itemHeight);

    return (
        <div className={className} ref={containerRef} onScroll={handleScroll}>
            {/* 2 spacer rỗng thay chỗ cho các item không render -- giữ đúng
          scrollHeight tổng để thanh cuộn không bị "nhảy"/co giật khi
          window trượt qua các item. aria-hidden vì không mang nội dung. */}
            <div style={{ height: topSpacerHeight }} aria-hidden="true" />
            {items.slice(startIndex, endIndex).map((item, i) => renderItem(item, startIndex + i))}
            <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />
        </div>
    );
}