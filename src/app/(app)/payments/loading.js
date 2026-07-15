import { TableSkeleton } from "@/components/common/table-skeleton";

export default function Loading() {
  return <TableSkeleton columns={7} rows={8} />;
}
