use strict;
use warnings;
use Test::More tests => 4;

use Test::Deep;

use Canto::Chado::GenotypeLookup;

use Canto::TestUtil;

my $test_util = Canto::TestUtil->new();

$test_util->init_test();

my $lookup = Canto::Chado::GenotypeLookup->new(config => $test_util->config());

my $res = $lookup->lookup(gene_primary_identifiers => ['SPCC576.16c']);

cmp_deeply($res,
           {
             results => [
               {
                 identifier => 'aaaa0007-test-genotype-2',
                 display_name => 'h+ cdc11-33 wtf22-a1',
                 allele_string => 'cdc11-33 wtf22-a1',
                 name => 'h+ cdc11-33 wtf22-a1',
                 allele_identifiers => [
                   'SPCC1739.11c:allele-1', 'SPCC576.16c:allele-1',
                 ]
               },
      ]
           });


$res = $lookup->lookup(gene_primary_identifiers => ['SPCC576.16c', 'SPCC1739.11c']);

cmp_deeply($res,
           {
             results => [
                           {
                             'identifier' => 'aaaa0007-test-genotype-2',
                             'allele_string' => 'cdc11-33 wtf22-a1',
                             'name' => 'h+ cdc11-33 wtf22-a1',
                             'display_name' => 'h+ cdc11-33 wtf22-a1',
                             allele_identifiers => [
                               'SPCC1739.11c:allele-1', 'SPCC576.16c:allele-1',
                             ],
                           }
                         ]
           });


$res = $lookup->lookup(gene_primary_identifiers => ['SPCC1739.11c']);

cmp_deeply($res,
           {
             results => [
                           {
                             'allele_string' => 'cdc11-33',
                             'name' => 'h+ cdc11-33',
                           'identifier' => 'aaaa0007-test-genotype-1',
                             'display_name' => 'h+ cdc11-33',
                             allele_identifiers => [
                               'SPCC1739.11c:allele-1',
                             ]
                           },
                           {
                             'allele_string' => 'cdc11-33 wtf22-a1',
                             'name' => 'h+ cdc11-33 wtf22-a1',
                             'identifier' => 'aaaa0007-test-genotype-2',
                             'display_name' => 'h+ cdc11-33 wtf22-a1',
                             allele_identifiers => [
                               'SPCC1739.11c:allele-1', 'SPCC576.16c:allele-1',
                             ]
                           }
                         ]
           });

$res = $lookup->lookup(identifier => 'aaaa0007-test-genotype-1');

cmp_deeply($res,
           {
             'allele_string' => 'cdc11-33',
             'name' => 'h+ cdc11-33',
             'display_name' => 'h+ cdc11-33',
             'identifier' => 'aaaa0007-test-genotype-1',
             allele_identifiers => [
               'SPCC1739.11c:allele-1',
             ]
           });
