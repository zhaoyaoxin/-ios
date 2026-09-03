//
//  ip_database.c
//  
//
//  Created by ZL on 31/09/2025.
//  Copyright © 2025 ZL. All rights reserved.
//

#include "ipbase.h"
#include <stdio.h>
#include <stdlib.h>

static int ipfile_lines_number(const char *path)
{
    int lines = 0;
    
    if (!path)
        return lines;
    
    FILE *fp = fopen(path, "r");
    if (!fp)
        return lines;
    
    char content[64];
    while (fgets(content, sizeof(content) - 1, fp))
        lines++;
    
    fclose(fp);
    return lines;
}

struct ip_range_info_list *ipbase_new_from_file(const char *path, bool n2ping_true_K1_false)
{
    FILE *fp = fopen(path, "r");

    uint32_t count = ipfile_lines_number(path);
    struct ip_range_info_list *ipdb = ip_range_list_init(count);
    
    uint32_t start, end;
    uint16_t area, isp;
    
    char content[64];
    for ( uint32_t n = 0; n < count; n ++ ) {
        if ( n2ping_true_K1_false ) {
            if ((fgets(content, sizeof(content) - 1, fp)) && (sscanf(content, "%d	%d	%hd	%hd", &start, &end, &area, &isp) == 4)) {
                if (start == 0 || end == 0)
                    continue;
                if (start > end)
                    continue;
                
                union {
                    uint32_t d32;
                    uint16_t d16[2];
                } value;
                
                value.d16[0] = area;
                value.d16[1] = isp;
                
                (ipdb->base)[n].start = start;
                (ipdb->base)[n].end = end;
                (ipdb->base)[n].value = value.d32;
            }
        }
        else {
            if ((fgets(content, sizeof(content) - 1, fp)) && (sscanf(content, "%d	%d	%hd", &start, &end, &isp) == 3)) {
                if (start == 0 || end == 0)
                    continue;
                if (start > end)
                    continue;
                
                (ipdb->base)[n].start = start;
                (ipdb->base)[n].end = end;
                (ipdb->base)[n].value = isp; // K1 只有 ISP
            }
        }
    }
    
    fclose(fp);
    
    sort_ip_range_info(ipdb);
    return ipdb;
}
