select "CustomerID", count(*) as invoice_count from "CustomerInvoices" where "CustomerID" in (742,767,792,817,851) group by "CustomerID" order by "CustomerID";
